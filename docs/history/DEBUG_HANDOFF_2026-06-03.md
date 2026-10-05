# Streamly — Channel Post Insert Hangs: Debug Handoff

**Date:** 2026-06-03
**Session ID:** `mvs_cb33f378da084e11b4a7e6f0e810579c`
**Branch:** `appmod/typescript-upgrade-20260601152729`
**Status:** Root cause identified, fix proposed, awaiting dev implementation

---

## TL;DR

In `app/(tabs)/channels/[id].tsx` → `CreateModal` → `handleSubmit`, the call chain:

```ts
supabase.from('channel_posts')
  .insert({...})
  .select('*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url)')
  .single()
```

**hangs forever in the React Native JS runtime**. The fetch is never initiated. The Promise never resolves. The Submit button spinner stays on. No POST request ever appears in the Supabase API log.

The Cloudflare upload step (XHR, FormData) works fine — the file lands in Cloudflare. Only the post-upload DB insert is broken. The database itself is healthy (manual SQL inserts work). All GETs work (auth/session is fine).

**The most likely culprit:** the combination of `.single()` (sends `Accept: application/vnd.pgrst.object+json` + `Prefer: return=representation`) with the FK-embed hint `author:profiles!channel_posts_author_id_fkey(...)`. The URL the supabase-js client builds from this combination triggers a hang in React Native's fetch polyfill.

---

## 1. Project Context

| | |
|---|---|
| App name | **Streamly** (folder is `jollify`, package is `streamly`) |
| Stack | Expo SDK 56 / React Native 0.85 / expo-router 4 |
| Backend | Supabase (project ref `wdtwjiixuueqejfraaod`, "cloud" project) |
| Video host | Cloudflare Stream (Edge Function `generate-stream-upload` v1) |
| Auth | Supabase Auth, `autoRefreshToken: true`, `persistSession: true`, custom SecureStore adapter (`lib/supabase.ts`) |
| Build | Local debug APK from `npx expo run:android` / `gradlew assembleDebug` |
| AVD | `emulator-5554` (running, debug build installed at `android/app/build/outputs/apk/debug/app-debug.apk`) |
| Test plan | `TEST_PLAN.md` — Test 5 ("Upload a video — lands in pending") is the failing case |

### Three upload paths in the app
| Path | File | What it does | Status |
|---|---|---|---|
| File upload (Files tab) | `lib/storage.ts` | `createSignedUploadUrl` → XHR PUT raw → `files` row | Works (not the failing case) |
| Post thumbnail | `lib/posts.ts` `uploadMedia` | base64 read → `supabase.storage.upload` → store path | Works (not the failing case) |
| **Channel video** | `lib/stream.ts` + `lib/posts.ts` `createPost` | Edge fn → XHR FormData to Cloudflare → **supabase insert with FK embed + .single()** | **BROKEN** |

---

## 2. The Bug — Symptom

**What the user sees:**

1. As `teste2e@gmail.com` (paid test user, owns channel "Test video"), open the channel
2. Tap "+ Add Content"
3. Pick a video (file, type "Movie", title "Mid test", thumbnail, submit)
4. Cloudflare upload completes → UI shows **"✓ Upload complete"** (red, under the video file picker)
5. **Submit button (top-right) stays as a spinner forever**
6. Modal never closes
7. No "Submitted ✓" success alert
8. No "Upload failed" error alert
9. **No row appears in `channel_posts`** in Supabase
10. Same behavior at 10MB, 44MB, and 200MB file sizes — the 200MB case was the user's first observation

**Reproduction rate:** 100% (every attempt hangs in the same place)

---

## 3. Diagnostic Journey — What We Proved

### 3.1 Database is healthy (no DB-side issue)

Manual SQL insert as `postgres` role with the same data succeeded:

```sql
insert into channel_posts (channel_id, author_id, body, content_type, status, video_url)
values (
  '9ba0b2f6-c474-468e-b03d-72e085bbfeae',
  '5be7b0e9-013d-45b2-8355-81003306c814',
  'manual test post',
  'movie',
  'pending',
  'manual-test-uid-123'
)
returning id, status, video_url, author_id, created_at;
-- → 1 row returned, status: pending
```

### 3.2 FK relationship in PostgREST works

The FK constraint is `channel_posts_author_id_fkey` (verified via `pg_constraint`). A SQL `LEFT JOIN profiles` on the inserted row returns the author data correctly:

```
author_join_id: 5be7b0e9-...  full_name: teste2e
```

So the `author:profiles!channel_posts_author_id_fkey` embed hint in the supabase-js query targets a real, valid relationship.

### 3.3 RLS is fine

`pg_policies` on `channel_posts`:
- INSERT "Members can post" — `WITH CHECK = ((auth.uid() = author_id) AND EXISTS(channel_members where user_id = auth.uid() AND channel_id = ...))` ✓
- SELECT "Authors see own posts" — `USING = (auth.uid() = author_id)` ✓
- SELECT "Members see approved posts", "Admins see all posts" ✓

`pg_policies` on `profiles`:
- All policies keyed on `auth.uid() = id` ✓

The test user `teste2e` (id `5be7b0e9-013d-45b2-8355-81003306c814`) is the channel owner and a member of `channel_members` for channel "Test video" (id `9ba0b2f6-c474-468e-b03d-72e085bbfeae`) with role `owner`. RLS should pass.

### 3.4 The app's supabase client works for GETs

Supabase API log shows the channel page load sequence (all 200):
```
GET /rest/v1/profiles
GET /auth/v1/user
GET /rest/v1/channel_posts   (x3, for grouping/listing)
GET /rest/v1/channel_members
GET /rest/v1/profiles        (x2)
GET /rest/v1/channels
```

**No `POST /rest/v1/channel_posts` request appears in the log at any time.** Not during the upload attempt, not in the 2 minutes after force-stopping the app.

### 3.5 The supabase client's POST never fires

Final test: force-stop the app, wait 2 minutes, then query for any new row:

```sql
select id, title, content_type, status, video_url, created_at
from channel_posts
where author_id = '5be7b0e9-013d-45b2-8355-81003306c814'
  and created_at > now() - interval '5 minutes'
order by created_at desc;
-- → 0 rows
```

Confirmed: **the supabase-js client's fetch is never initiated**. The hang is in JS, before the HTTP request.

### 3.6 Cloudflare side is healthy

- "✓ Upload complete" only fires when the XHR `onload` AND `status >= 200 && status < 300`. So Cloudflare received the file.
- Edge Function `generate-stream-upload` has `verify_jwt = false` in `supabase/config.toml`, so a stale session wouldn't break this step.

### 3.7 Two unrelated database-state issues (not the cause of this bug, but worth flagging)

These came up during diagnosis and should be fixed separately:

a. **`profiles.username` column does not exist** — `migration_v8.sql` was not fully applied. The `migration_v9_plan_fix.sql` was also not applied. Verify:
   ```sql
   select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'username';
   ```
   If empty, re-run `supabase/migration_v8.sql` then `supabase/migration_v9_plan_fix.sql` in the SQL Editor.

b. **`supabase_migrations.schema_migrations` table is missing** — odd state but not blocking. May have been wiped, or the project was set up without the Supabase CLI migration tracker. Worth a check but not urgent.

---

## 4. The Failing Code (for the dev)

`lib/posts.ts` lines ~129–198, `createPost`:

```ts
async createPost(channelId, authorId, body, options): Promise<ChannelPost> {
  let mediaUrl: string | null = null;
  let thumbnailUrl: string | null = null;

  if (options?.mediaUri && options?.mediaType) {
    try {
      mediaUrl = await PostService.uploadMedia(authorId, options.mediaUri, options.mediaType);
    } catch {
      mediaUrl = null;  // silent swallow — could mask issues
    }
  }
  if (options?.thumbnailUri) {
    try {
      thumbnailUrl = await PostService.uploadMedia(authorId, options.thumbnailUri, 'image');
    } catch {
      thumbnailUrl = null;
    }
  }

  const videoUrl: string | null = options?.streamVideoUid ?? null;

  // ❌ THIS BLOCK IS WHAT HANGS:
  const { data, error } = await supabase
    .from('channel_posts')
    .insert({
      channel_id: channelId,
      author_id: authorId,
      title: options?.title?.trim() || null,
      body: body.trim(),
      media_url: mediaUrl,
      media_type: mediaUrl ? options?.mediaType ?? 'image' : null,
      thumbnail_url: thumbnailUrl,
      content_type: options?.contentType ?? 'post',
      genre: options?.genre || null,
      duration_min: options?.durationMin || null,
      season_number: options?.seasonNumber || null,
      episode_number: options?.episodeNumber || null,
      episode_title: options?.episodeTitle || null,
      release_year: options?.releaseYear || new Date().getFullYear(),
      video_url: videoUrl,
      submitted_at: options?.saveAsDraft ? null : new Date().toISOString(),
      series_id: options?.seriesId ?? null,
      status: options?.saveAsDraft ? 'draft' : 'pending',
    })
    .select('*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url)')
    .single();   // ← HANG HAPPENS HERE, BEFORE NETWORK CALL

  if (error) throw error;
  return data as ChannelPost;
},
```

The caller `app/(tabs)/channels/[id].tsx` → `handleSubmitContent` (line ~556) awaits this and the success alert only fires if it resolves. The Submit button spinner in `CreateModal.handleSubmit` (line ~276) only clears in the `finally` block — which never runs while the promise is pending.

---

## 5. The Proposed Fix

**One file: `lib/posts.ts`**

**Change 1: Drop the embed + .single() from the insert's select.** The author info isn't needed in the immediate insert response — `load()` will fetch it in the next render via `getChannelPosts`. Replace:

```ts
.select('*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url)')
.single();
```

with a plain insert + minimal select, and a 30s timeout to prevent future silent hangs:

```ts
// 30s timeout — if the supabase call hangs again, surface it as a real error
// so the user sees "Upload failed: timed out" instead of a stuck spinner.
const ac = new AbortController();
const timer = setTimeout(() => ac.abort('insert-timeout'), 30_000);
try {
  const { data, error } = await supabase
    .from('channel_posts')
    .insert({...same payload...})
    .select('id, channel_id, author_id, title, body, content_type, status, video_url, created_at')
    .abortSignal(ac.signal)
    .maybeSingle();  // returns null on 0 rows instead of throwing like .single()
  if (error) throw error;
  return data as ChannelPost;
} finally {
  clearTimeout(timer);
}
```

**Why this is the right fix:**

- **Removes the fragile URL the bug is in.** The `!fk_name` embed hint combined with `.single()`'s `Accept` header is what supabase-js was hanging on. Plain `.select('col,col,col')` + `.maybeSingle()` is the most boring, most-supported code path.
- **Adds a hard timeout.** Even if the JS runtime decides to hang on something else in the future, the user gets a clean error in 30s and the spinner clears.
- **Preserves all behavior.** The payload is identical, the type returned is the same, the `handleSubmitContent` caller doesn't need to change.

**Optional follow-up (separate change, do after the fix is verified):**

The `try/catch` blocks around `uploadMedia` (lines 156, 164) silently swallow errors. Worth surfacing those so a thumbnail upload failure doesn't silently drop the thumbnail. But not blocking.

---

## 6. How to Verify the Fix

1. **Apply the diff above to `lib/posts.ts`**
2. **Rebuild:** `npx expo run:android` (or just `cd android && ./gradlew assembleDebug` for the APK only)
3. **Install on AVD:** APK ends up at `android/app/build/outputs/apk/debug/app-debug.apk`. The user's `adb` is at `C:\Users\krishna\AppData\Local\Android\Sdk\platform-tools\adb.exe`. Commands:
   ```powershell
   & "C:/Users/krishna/AppData/Local/Android/Sdk/platform-tools/adb.exe" install -r "D:/Joliffy/jollify/android/app/build/outputs/apk/debug/app-debug.apk"
   & "C:/Users/krishna/AppData/Local/Android/Sdk/platform-tools/adb.exe" shell monkey -p com.streamly.app -c android.intent.category.LAUNCHER 1
   ```
4. **Sign in as `teste2e@gmail.com`** (or any user with `can_upload_content = true` who's a channel owner)
5. **Run Test 5 from `TEST_PLAN.md`** — open the channel, + Add Content, pick a video, submit
6. **Expected after fix:**
   - "✓ Upload complete" → modal closes → "Submitted ✓ Your content is under review..." alert
   - New row visible in `channel_posts` for that user
   - If the bug recurs, the spinner should clear in 30s with a clear error toast ("Upload failed: insert-timeout") instead of hanging forever
7. **Verify in Supabase API log:** a `POST /rest/v1/channel_posts` request should appear with `status: 201`

### Optional: simulate a "happy path" RLS test in SQL before re-test

If the dev wants to be extra sure RLS allows the insert end-to-end as `teste2e`:
```sql
-- Impersonate the test user via request.jwt.claims
select set_config('request.jwt.claims',
  '{"sub": "5be7b0e9-013d-45b2-8355-81003306c814", "role": "authenticated"}',
  false);  -- false = session-level, persists across statements in same session
-- Then in the same session:
insert into channel_posts (channel_id, author_id, body, content_type, status, video_url)
values (
  '9ba0b2f6-c474-468e-b03d-72e085bbfeae',
  '5be7b0e9-013d-45b2-8355-81003306c814',
  'rls impersonation test', 'movie', 'pending', 'rls-test-uid'
)
returning id;
-- Expect: 1 row returned. If 0 rows or error, RLS is blocking.
```
(Note: as of this writing the user ran this test with `is_local=true` accidentally, which only applies to the autocommit transaction of that single statement. Using `is_local=false` makes the JWT claim persist for the rest of the session, so the insert sees the same auth context the app would.)

---

## 7. Reference IDs (for the dev's convenience)

- Supabase project: `wdtwjiixuueqejfraaod` (https://wdtwjiixuueqejfraaod.supabase.co)
- Test user (`teste2e`): `5be7b0e9-013d-45b2-8355-81003306c814`
- Test channel ("Test video"): `9ba0b2f6-c474-468e-b03d-72e085bbfeae`
- Channel owner = test user (above)
- Admin user (`krishnapate43@gmail.com`): `ab2fc9a7-fe05-4770-a15d-0f69d1b88594`
- Cloudflare account: `2c250cc972b1947db19a293227df6edc`
- Edge Function: `generate-stream-upload` (in `supabase/functions/generate-stream-upload/`)

---

## 8. Out of Scope (mentioning so the dev knows)

- `profiles.username` column missing — `migration_v8.sql` not applied (use `migration_v9_plan_fix.sql` if v8 fails mid-way)
- `supabase_migrations.schema_migrations` table missing — not blocking, but suggests migrations were applied via raw SQL editor and the CLI tracker got out of sync
- The 30-min free-tier usage timer (`hooks/useUsageTimer.ts`) bypasses for paid users — fine
- `getStorageAdapter()` in `lib/supabase.ts` uses SecureStore on native with AsyncStorage overflow for >2KB JWT — fine
- The "creator access locked" banner on the channel page is a UX feature, not related to this bug

---

## 9. Files to Read First (priority order for the dev)

1. `lib/posts.ts` — `createPost` is the fix site (~lines 129–198)
2. `app/(tabs)/channels/[id].tsx` — `CreateModal.handleSubmit` and `handleSubmitContent` are the call sites
3. `lib/supabase.ts` — client config, in case the dev wants to bump supabase-js
4. `lib/stream.ts` — `uploadVideo` (Cloudflare step, working as expected)
5. `supabase/migration_v8.sql` + `migration_v9_plan_fix.sql` — for the username column fix
6. `TEST_PLAN.md` — Test 5 is the regression test for this fix

---

End of handoff.
