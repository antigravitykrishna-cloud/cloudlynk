# Cloudlynk — Handover

Snapshot taken 2026-09-05. Android app (Expo / React Native) with a Supabase
backend and Cloudflare Stream + R2 for media.

---

## ⚠️ READ FIRST — this archive contains live production credentials

This was included deliberately, at the owner's instruction. It means:

| File | What it is |
|---|---|
| `.env` | `SUPABASE_SECRET_KEY` — the **service-role key**. It bypasses *every* RLS policy in the database, including the approval gate and the content-access grant system. Also `CLOUDFLARE_R2_SECRET_ACCESS_KEY` and `CLOUDFLARE_STREAM_API_TOKEN`. |
| `android/app/cloudlynk-release.jks` | The **release signing keystore**. Whoever holds it can sign builds as Cloudlynk. |

Both are normally gitignored and were never committed.

**Actions expected of the receiving team:**

1. Treat this archive as a secret. Do not put it in a public repo, a shared
   drive, or a ticket attachment.
2. Rotate `SUPABASE_SECRET_KEY`, the R2 keys and the Stream API token when the
   engagement ends, or sooner if the archive is copied anywhere.
3. Keep the keystore backed up somewhere durable. If it is lost, a Play Console
   key reset is required and that takes time. If it leaks, the same.

---

## Current deployed state

**Database:** Supabase project `wdtwjiixuueqejfraaod`. Migrations are applied
through **v56** (`supabase/migrations/20260906120000_v56_admin_content_and_access.sql`).
`npx supabase migration list --linked` should show local == remote for all 16.

**Edge functions deployed:** `stream-playback-token`, `stream-set-access`,
`generate-stream-upload`, `verify-play-receipt`, `play-rtdn-webhook`,
`delete-account`, and the legal-pages/account-deletion functions.

**App build:** `apk/cloudlynk-v0.7.0-release.apk`, built 2026-09-05 from this
source. Installs over the previous build in place.

> The APK is **debug-signed**, not release-signed. No `CLOUDLYNK_RELEASE_*`
> Gradle properties are set anywhere, so `android/app/build.gradle:156` falls
> back to the debug config. Fine for sideload testing; **not** uploadable to
> Play as-is. See "Before a Play upload" below.

---

## Architecture notes that are easy to get wrong

### Two kinds of content access — do not conflate them

- **Paid premium** — a subscriber (`profiles.plan_status` in `active`/`lifetime`)
  automatically sees everything with `access_level = 'premium'`.
- **Admin grant** — one named person gets one named post, subscription or not.
  That is `content_access_grants`, added in v56.

They are separate systems feeding one decision. A grant **never** touches
`plan_status`, and revoking a grant **never** disturbs a paid subscription.

`public.has_content_access(post_id, user_id)` is the single definition of "holds
a grant". Both the RLS policy (`channel_posts_select_v56`) and the
`stream-playback-token` edge function call it. **Do not reimplement that
condition anywhere** — if the feed and the player disagree, a granted user sees
a post in the list and then gets a 403 on play.

### Never withhold a paid entitlement

The approval gate (v55) is a **pre-purchase** gate: an unapproved account cannot
reach the subscribe flow, but keeps a fully working free tier. Once money has
changed hands the entitlement is granted, full stop — `verify-play-receipt` does
not read `approval_status` and must not start.

This shape is not arbitrary. Taking payment and then withholding access pending
an admin click is what got the app removed from Google Play once already
(`docs/PLAY_STORE_COMPLIANCE_AUDIT.md`, Finding 1).

### Premium → free is a one-way door on Cloudflare unless you go through the function

`stream-playback-token` permanently sets `requireSignedURLs=true` on a
Cloudflare video the first time a premium post is played, and caches it in
`stream_videos.signed_locked`. Free playback uses a plain unsigned URL, which a
locked video rejects.

So changing `access_level` in the database alone leaves the video **permanently
unplayable**, with no diagnosable error. Always go through the
`stream-set-access` edge function (`AdminContentService.setPostAccessLevel`),
which clears the flag, unlocks Cloudflare, and only then changes the level. Any
failure leaves the post premium and self-heals on the next play.

### Admins cannot read other users' profiles

The only SELECT policies on `public.profiles` are all `auth.uid() = id`. An admin
querying someone else's row gets an **empty result, silently** — no error. This
is why several screens used to display "Unknown".

The fix is **not** to widen that policy. Use the `SECURITY DEFINER` readers:
`admin_search_users`, `admin_get_profiles_by_ids`, `admin_get_post_grantees`,
`admin_get_user_grants`, `admin_list_audit_log`, `admin_list_user_approvals`.

### Every admin RPC re-verifies `is_admin` itself

The `isAdmin` checks in the screens are UX only. The database is the boundary.
Keep it that way when adding new admin actions.

---

## Verified, and not verified

**Verified against the production database** (in a rolled-back transaction, real
free account, two premium posts differing only in entitlement):

- Before a grant: neither premium post visible. After: the granted post visible,
  the other still not. After revoke: not visible again.
- `has_content_access` — the exact call the player makes — `true` for the
  granted post, `false` for the other, `false` after revoke.
- `plan_status` unchanged (`free`) before, after grant, and after revoke.
- Revoke keeps the row as `revoked` rather than deleting it. Audit rows written.
- Non-admin blocked from: direct `INSERT` into `content_access_grants` (RLS),
  `admin_grant_content_access`, `admin_search_users`, `admin_list_audit_log`.
- Exactly **one** SELECT policy on `channel_posts` (`channel_posts_select_v56`);
  the v52 one is dropped. `admin_audit_log` has RLS on with **zero** policies.
- v55: all 21 existing accounts backfilled to `approved`; self-approval blocked
  by the `protect_profile_privileged_fields` trigger.

**NOT verified — treat these as open:**

1. **Signed playback for a granted user.** Proven at the input the edge function
   reads, but the function was never invoked over HTTP with a real user JWT.
   Feed visibility is proven; the playback half is not.
2. **Premium → free on an already-played video.** The unlock ordering is built to
   fail safe but has not been watched happen. Test with a video that has actually
   been played, so Cloudflare has it locked.
3. **Admin upload.** Never run against a real Cloudflare upload.
4. **Save as draft.** See below — newly functional, never exercised.
5. **Anything needing Play Billing.** There is still no Play Console account.

---

## Known issues / open items

**`save as draft` never worked until v56.** `lib/posts.ts` wrote
`status: 'draft'` while the CHECK constraint only allowed
`('pending','approved','rejected','removed')` — so every draft save was silently
rejected by the database, probably since the feature was written. v56 adds
`'draft'` to the constraint. The code path is therefore new and untested.

**Signup terms acceptance — one thing still unexplained.** Established: an
account created at 18:28:51 had its `terms_accepted_at` written at 18:29:10, when
the user tapped Continue — so the `acceptTerms()` call inside `signUp()` did not
write. Not known: whether the RPC ran without a session (so `auth.uid()` was null
and `accept_terms` raised `42501`), or ran with one and the `UPDATE` matched zero
rows. The failure is invisible because its only log is behind `__DEV__`, false in
release. Cost: one extra "One more step" screen after signup, which now works and
blocks nobody. To settle it: make that catch log unconditionally, rebuild, sign
up once, read `adb logcat`.

**`npm run lint` does not run.** ESLint 10.9.1 crashes with
`EslintPluginImportResolveError: typescript with invalid interface loaded as
resolver`. Pre-existing and reproducible on a clean tree — it is a dependency
incompatibility, not a code problem. `npx tsc --noEmit` is clean and is the
working check.

**The repo's migrations cannot build a database from scratch.** The first one
(v40) assumes a dashboard-created `app_settings` table that no migration creates,
so `npx supabase start` fails immediately. The live schema was built
dashboard-first and the migrations are a partial retrofit. Consequence: **there is
no local Supabase to test against** — anything exercised end-to-end goes against
production. Worth fixing with a baseline migration.

**`versionCode` is stale.** `app.json` says `7`; the native project still reports
`1` because `android/` predates it and has not been re-prebuilt.

**Google Sign-In removal is not complete server-side.** The app no longer offers
it, but the Google provider should be switched **off** in the Supabase dashboard
(Authentication → Providers → Google), or the backend still accepts Google
sign-ins. Redirect URLs for the old flow can come out at the same time.

---

## Running it

```bash
npm install
npx expo start          # dev
```

Local release APK:

```bash
cd android
./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Database and functions:

```bash
npx supabase migration list --linked
npx supabase db push --linked
npx supabase functions deploy <name>
```

### Before a Play upload

1. Set `CLOUDLYNK_RELEASE_STORE_FILE`, `CLOUDLYNK_RELEASE_STORE_PASSWORD`,
   `CLOUDLYNK_RELEASE_KEY_ALIAS` (and key password) in `android/gradle.properties`
   or `~/.gradle/gradle.properties`, so the build stops falling back to debug
   signing. The keystore is at `android/app/cloudlynk-release.jks`.
2. Fix `versionCode`.
3. Run `npx expo prebuild --platform android --clean` if `android/` needs to catch
   up with `app.json` — but re-check the signing block and `AndroidManifest.xml`
   afterwards, since prebuild only preserves what is expressed in `app.json` or a
   config plugin.

---

## Where things are

| Path | What |
|---|---|
| `app/admin/` | Admin panel: `content`, `upload`, `post-access`, `audit`, `user-approvals`, `reports`, pending-channel screens |
| `lib/adminContent.ts` | Typed client for every v56 admin RPC |
| `lib/posts.ts` | `createPost`, access-level defaults, post queries |
| `lib/stream.ts` | Cloudflare Stream upload + playback URL resolution |
| `hooks/useAuth.ts` | Auth + the shared profile store (see below) |
| `supabase/migrations/` | Schema history; v55 and v56 are the recent ones |
| `supabase/functions/` | Edge functions |
| `BACKEND_REFERENCE.md` | The detailed backend contract — **start here** |
| `CLAUDE_TASK_*.json` | The task specs each recent change was built from |

**One thing worth knowing about `hooks/useAuth.ts`:** it is a plain hook, not a
context, so ~25 components each hold their own instance. The `profile` is
therefore kept in a **module-level store** read via `useSyncExternalStore`, so a
fetch in one screen reaches all of them. Before that, a screen could write to the
profile and the root layout would keep routing on a stale copy — which silently
broke signup. If you add more shared auth state, put it in that store rather than
per-instance `useState`.
