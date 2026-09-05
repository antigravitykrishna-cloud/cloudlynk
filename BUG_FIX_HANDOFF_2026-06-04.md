# Streamly — Bug-Fix Handoff (Paste to your dev)

**From:** Krishna (product owner)
**To:** Dev
**Goal:** Get Streamly to "perfect health" before the Cloudflare Stream plan upgrade ships. After these fixes, the app should be stable for real users, with no user-facing crashes, no security holes, and a clean upgrade path when the higher Stream tier arrives.

**Priority order:** do them top-to-bottom. Each section is independent and shippable on its own — but #1 and #2 are the highest impact.

---

## #1 — Notification crash on bell tap (highest priority, currently broken)

**Symptom:** Bell shows "4" unread correctly, but tapping it crashes the app.

**What's already in the code:** A defensive `NOTIF_META[notif.type] ?? {fallback}` guard was added at `app/notifications.tsx:36` last session — but the user is still seeing the crash on the latest APK, so the real cause is elsewhere.

**Why we don't know the exact cause:** Static analysis of `useNotifications.ts` and `app/notifications.tsx` didn't reveal an obvious crash. The notifications query (`getAll`) uses `.select('*')` with NO embed, so it's not a PostgREST ambiguity. The `NOTIF_META` guard should cover the only obvious `undefined.meta.*` path.

**What we need from you:** A real stack trace. Please:

1. Confirm phone is connected (`adb devices` → `RZCX10AZVXK device`).
2. Clear logcat: `adb -s RZCX10AZVXK logcat -c`.
3. **Ask Krishna to tap the bell on his phone** (it'll crash).
4. Immediately run: `adb -s RZCX10AZVXK logcat -d -v time ReactNativeJS:V *:E 2>&1 | Select-String -Pattern "Error|TypeError|FATAL|undefined|null|Cannot|ExceptionsManager|stack" | Select-Object -Last 100`
5. Paste the last 50–100 JS log lines — the stack trace will name the file and line.

**Most likely culprits** (in order of probability, from static analysis):
- A render path in `NotifCard` reading a field that's null on some legacy row (e.g., `notif.created_at` being null from a pre-migration insert)
- A `formatTimeAgo(notif.created_at)` call returning a strange value but not crashing — unlikely to be the cause
- The `useNotifications` realtime channel failing to subscribe on this version of supabase-js — possible but rare
- Something in the navigation push from notifications tap → channels/[id] — unlikely because the crash is on OPEN, not on tap

**Reference files:**
- `app/notifications.tsx` (whole file, especially `NotifCard` at line 33)
- `hooks/useNotifications.ts` (the data fetch + realtime subscription)
- `lib/notifications.ts` (`getAll`, `getUnreadCount`, `send`, `markAsRead`, `markAllAsRead`)

**Related minor bug (not the crash, but please fix in the same patch):**

`useNotifications.ts` `markAllAsRead` signature mismatch — it takes `userId: string` but the button calls `onPress={markAllAsRead}` with no argument. The service call then does `.eq('user_id', undefined)` which silently matches 0 rows in the DB. The UI optimistically updates to 0 unread, but on next refresh the 4 come back. Fix: curry it.

```ts
// hooks/useNotifications.ts
const markAllAsRead = useCallback(async () => {
  if (!userId) return;
  await NotificationService.markAllAsRead(userId);
  setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  setUnreadCount(0);
}, [userId]);   // ← userId in deps now
```

---

## #2 — 200MB upload cap (5-minute fix, blocks client handover polish)

**Symptom:** Videos over ~200MB get rejected by Cloudflare Stream with HTTP 413 "Payload Too Large" (the response is Cloudflare's HTML 413 page, not JSON). Current `StreamService.uploadVideo` shows the raw HTML in the error toast.

**Verified empirically by Krishna:** 136MB works, 190MB works, 214MB fails, 288MB fails. Cap is **200MB** (the Stream Bundle Basic per-file limit). 700MB definitely fails.

**Two patches:**

**Patch 2a — pre-flight size check in `app/(tabs)/channels/[id].tsx` `handlePickVideo` (around line 308):**

```tsx
const handlePickVideo = async () => {
  if (picking || submitting) return;
  setPicking(true);
  try {
    const result = await StreamService.pickVideo();
    if (result) {
      // Cloudflare Stream Bundle Basic caps per-file at 200MB.
      // 180MB safety margin accounts for multipart overhead + encoding.
      const STREAM_MAX_MB = 180;
      if (result.size > STREAM_MAX_MB * 1024 * 1024) {
        Alert.alert(
          'File too large',
          `This video is ${(result.size / 1024 / 1024).toFixed(0)} MB. The current upload limit is ${STREAM_MAX_MB} MB. Please pick a smaller file.`,
          [{ text: 'OK' }]
        );
        return;
      }
      setVideoMeta(result);
    }
  } catch (err: any) { Alert.alert('Error', err.message); }
  finally { setPicking(false); }
};
```

**Patch 2b — clean 413 error in `lib/stream.ts` `uploadVideo` (around line 73):**

```ts
xhr.onload = () => {
  if (xhr.status >= 200 && xhr.status < 300) {
    onProgress(1);
    resolve(uid);
  } else if (xhr.status === 413) {
    reject(new Error('Video is too large for your current Cloudflare Stream plan. Maximum upload size is 200 MB. Please pick a smaller file.'));
  } else if (xhr.status >= 500) {
    reject(new Error('Cloudflare is having trouble receiving the file right now. Please try again in a moment.'));
  } else {
    reject(new Error(`Video upload failed (HTTP ${xhr.status}). Please try again.`));
  }
};
```

**Key change:** No more raw HTML body in user-facing toasts. Status-specific friendly messages.

**Note for after Cloudflare plan upgrade:** when the client upgrades, change `STREAM_MAX_MB` to whatever the new cap is. No other code change needed.

---

## #3 — IAP self-upgrade security hole (CRITICAL, must fix before any user touches the app)

**Symptom:** None visible to users, but any user with their JWT can become premium for free by running:

```bash
curl -X POST 'https://wdtwjiixuueqejfraaod.supabase.co/rest/v1/profiles?id=eq.<their_id>' \
  -H "apikey: <anon_key>" -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"plan": "premium", "storage_limit": 214748364800, "can_upload_content": true}'
```

**Why it's broken:** `app/(tabs)/_layout.tsx` `onPurchaseSuccess` (line ~57) does:
```ts
await supabase.from('profiles').update({ plan, storage_limit, can_upload_content: true }).eq('id', user.id);
```
The RLS policy `"Users can update own profile"` (in `supabase/schema.sql:193`) allows this. **No server-side receipt verification.** The Google Play receipt is trusted client-side.

**Two-layer fix (do both):**

**Layer 3a — tighten the profiles RLS so users can't self-promote `plan`/`storage_limit`/`can_upload_content`/`is_admin`/`role`.**

In Supabase SQL Editor, replace the existing `"Users can update own profile"` policy with:

```sql
-- Drop the current loose policy
drop policy if exists "Users can update own profile" on public.profiles;

-- Tight policy: user can update SAFE fields only. The sensitive fields
-- (plan, storage_limit, can_upload_content, is_admin, role, creator_status,
-- acquisition_source) must be set via a SECURITY DEFINER function.
create policy "Users update safe profile fields only"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and plan             = (select plan             from public.profiles where id = auth.uid())
    and storage_limit    = (select storage_limit    from public.profiles where id = auth.uid())
    and can_upload_content = (select can_upload_content from public.profiles where id = auth.uid())
    and is_admin         = (select is_admin         from public.profiles where id = auth.uid())
    and role             = (select role             from public.profiles where id = auth.uid())
    and creator_status   = (select creator_status   from public.profiles where id = auth.uid())
    and acquisition_source = (select acquisition_source from public.profiles where id = auth.uid())
  );
```

Verify with: a test user calling `UPDATE profiles SET plan='premium'` from their JWT should now get a 403/row-level-security error.

**Layer 3b — server-side receipt verification (the proper fix).**

Move the IAP success handler from the client to an edge function. Pseudocode:

```ts
// supabase/functions/verify-iap-purchase/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { purchaseToken, productId, platform } = await req.json();
  // platform: 'android' or 'ios'

  // 1. Verify the receipt with Google Play Developer API (Android) or App Store Server API (iOS)
  // 2. If valid, update the user's profile via the service-role client
  // 3. Return success/failure to the client
});
```

The client then calls this edge function on purchase success instead of doing the DB update directly. **Without this layer, layer 3a alone is just obfuscation** — a determined attacker can still hit the edge function with a forged receipt. But layer 3a makes casual self-upgrade impossible, which is enough for now.

**This is the most important security fix in the codebase.** Anyone testing the app for 30 seconds can get premium.

---

## #4 — Migration state is corrupted (must do before #3)

**Symptom:** None directly visible. But:
- `select column_name from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='username';` returns 0 rows — the column is missing
- `select distinct plan from public.profiles;` — the plan check constraint is still in its old `('free', 'pro', 'enterprise')` state from the original `schema.sql:22`
- The `supabase_migrations.schema_migrations` table is missing

**Why it matters:** When you do the IAP fix in #3 and the client tries to write `plan: 'standard'` or `plan: 'premium'`, **the old constraint will reject it**. Same for the IAP success handler that sets `storage_limit`. The fix in #3 will appear to fail because of this underlying schema state.

**Fix:** In Supabase SQL Editor, run **in order**:

1. `supabase/migration_v8.sql` (adds `username` column, drops old plan check constraint, adds new one with `('free', 'standard', 'premium')`, backfills usernames)
2. `supabase/migration_v9_plan_fix.sql` (repair script if v8 fails partway)

**Verify after:**
```sql
-- Should return 1 row, type: text
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'username';

-- Should return only 'free', 'standard', 'premium'
select distinct plan from public.profiles;

-- Should return the new constraint
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.profiles'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%plan%';
```

Do this BEFORE patching the IAP success handler, otherwise the receipt-verification edge function will succeed but the profile update will silently 0-row-update.

---

## #5 — Database types drift (medium, 30-min cleanup)

**Symptom:** `lib/supabase.ts` has a hand-written `Database` type (lines 95–269) that's already missing columns that exist in the live DB. This is why you see `(profile as any)?.is_admin` in 4+ places in the code — those `as any` casts are workarounds for the type drift.

**Fix:** Generate the types from the live database, replacing the hand-written one:

```bash
# Requires the Supabase CLI (npx supabase is fine)
npx supabase gen types typescript --project-id wdtwjiixuueqejfraaod --schema public > lib/database.types.ts
```

Then in `lib/supabase.ts`, change the import:

```ts
// At the top
import type { Database } from './database.types';

// Then remove the hand-written Database type from lines 95–269
```

**After regenerating:**
- The `(profile as any)?.is_admin` casts in `profile.tsx`, `index.tsx`, `admin.tsx` should now type-check without `as any`
- Run `npx tsc --noEmit` and fix any new errors that surface (the regenerated types will be stricter)
- Wire this into CI so types don't drift again: a GitHub Action that runs `npx supabase gen types` on every PR

**Bigger refactor (defer):** Once the types are correct, you can remove the `as ChannelPost` and `as any` casts throughout the codebase. The TS compiler will tell you exactly where.

---

## #6 — Silent error swallowing in `createPost` (5-min fix)

**Symptom:** If thumbnail upload fails, the post is still created — but the thumbnail is silently null and the user never knows. Same for the optional media.

**Where:** `lib/posts.ts` lines 156–160 and 161–167:

```ts
if (options?.mediaUri && options?.mediaType) {
  try {
    mediaUrl = await PostService.uploadMedia(authorId, options.mediaUri, options.mediaType);
  } catch {                              // ← swallows the error
    mediaUrl = null;
  }
}
```

**Fix:** Surface the error to the user. Either:
- Re-throw so `handleSubmit`'s catch shows it, OR
- Add a non-blocking alert after the post is created: "Your post was submitted, but the thumbnail failed to upload. You can re-upload from the post page."

The minimal change is the re-throw. The "post with no thumbnail" UX is ugly enough that the user should know.

```ts
if (options?.mediaUri && options?.mediaType) {
  try {
    mediaUrl = await PostService.uploadMedia(authorId, options.mediaUri, options.mediaType);
  } catch (err) {
    console.warn('[createPost] media upload failed:', err);
    throw new Error('Media upload failed. Please try again or pick a smaller file.');
  }
}
if (options?.thumbnailUri) {
  try {
    thumbnailUrl = await PostService.uploadMedia(authorId, options.thumbnailUri, 'image');
  } catch (err) {
    console.warn('[createPost] thumbnail upload failed:', err);
    throw new Error('Thumbnail upload failed. Please try again.');
  }
}
```

(Apply the same pattern to other try/catch + silent null patterns you find.)

---

## #7 — Sign-up race in `useAuth.signUp` (5-min fix)

**Symptom:** User signs up, types a `full_name`. The `auth.signUp` fires the `handle_new_user` trigger which creates a `profiles` row with `full_name = email prefix` (from the trigger's `split_part(email, '@', 1)`). Then `useAuth.signUp` immediately does `supabase.from('profiles').insert({ full_name: typedName, ... })` which conflicts with the trigger's row. The `ON CONFLICT (id) DO NOTHING` saves it from erroring, but the user's typed `full_name` is **dropped**.

**Where:** `hooks/useAuth.ts` lines 45–67.

**Fix:** Pass the typed name via Supabase's `data` option so the trigger picks it up, then DELETE the manual insert:

```ts
async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName.trim() },   // ← passed to trigger via raw_user_meta_data
    },
  });
  if (error) throw error;
  if (!data.user) throw new Error('Signup failed — no user returned.');
  // No manual insert — the trigger creates the profile with the right full_name
}
```

The existing trigger in `schema.sql` already does:
```sql
COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
```
so passing `full_name` in `options.data` is picked up automatically.

---

## #8 — No storage quota enforcement (1-hour fix)

**Symptom:** User on free plan (15GB) can upload 100GB+. The `storage_used` counter goes past `storage_limit`, the UI bar overflows past 100%, and `increment_storage_used` happily accepts the delta. No client-side check, no server-side check.

**Fix (two parts):**

**Part 8a — pre-flight client-side check in `useFiles.uploadImage` and `useFiles.uploadDocument` (around lines 31 and 76 in `hooks/useFiles.ts`):**

```ts
const uploadImage = useCallback(async (channelId?: string) => {
  if (!userId) return;
  const asset = await StorageService.pickImage();
  if (!asset) return;
  
  // Quota check
  const { data: profile } = await supabase
    .from('profiles').select('storage_used, storage_limit').eq('id', userId).single();
  if (profile && (profile.storage_used + (asset.fileSize ?? 0)) > profile.storage_limit) {
    Alert.alert('Storage limit reached',
      `This upload would exceed your plan's ${formatBytes(profile.storage_limit)} limit. Please upgrade or delete some files.`);
    return;
  }
  // ... rest of upload
}, [userId, loadFiles]);
```

**Part 8b — server-side check in `supabase/storage_used` RPC.** Add a constraint at the database level so `increment_storage_used` refuses to push the counter past `storage_limit`:

In Supabase SQL Editor:
```sql
create or replace function public.increment_storage_used(p_user_id uuid, p_bytes bigint)
returns void language plpgsql security definer as $$
declare
  v_current bigint;
  v_limit   bigint;
begin
  select storage_used, storage_limit into v_current, v_limit
  from public.profiles where id = p_user_id;
  
  if v_current + p_bytes > v_limit then
    raise exception 'Storage limit exceeded: current=%, limit=%, attempt=+%', v_current, v_limit, p_bytes
      using errcode = 'P0001';
  end if;
  
  update public.profiles
  set storage_used = storage_used + p_bytes
  where id = p_user_id;
end;
$$;
```

The StorageService upload's `increment_storage_used` call will now throw if the user is over quota. The error will propagate up to the `useFiles.uploadImage` catch, which currently silently sets status to 'failed'. Add an Alert there too.

---

## What I'm explicitly NOT asking for (defer until after Cloudflare plan upgrade)

- Splitting the 814-line `app/(tabs)/channels/[id].tsx` into smaller components
- Adding tests (zero tests anywhere — add at least one happy-path test per upload path)
- Adding accessibility labels
- Fixing the `useNotifications` realtime channel leak across navigations
- ESLint configuration fix (23 react/* rules disabled)
- Replacing useFiles duplication between Home and Files screens with shared cache
- Polishing the useUsageTimer boundary off-by-one

These are all in the bug list but are polish, not bugs. The above 8 are the ones that matter.

---

## Suggested dev execution order

1. **#4 (migrations)** — 10 min, prerequisite for #3
2. **#3 (IAP security)** — 1 hour, two SQL changes + edge function stub
3. **#1 (notification crash)** — 1–2 hours, needs logcat first
4. **#2 (size cap)** — 5 min, after #1
5. **#6, #7, #8 (small quality fixes)** — 1 hour total
6. **#5 (types regen)** — 30 min, last because it might surface a few small things

After all 8: run `npx tsc --noEmit && npx eslint .` to confirm clean build, then rebuild and reinstall the APK. The user will re-test the full upload → store → review → approve → play → notifications flow.

After the Cloudflare Stream plan upgrade lands, the only code change is the `STREAM_MAX_MB` constant in patch #2a. Nothing else.

---

End of handoff.
