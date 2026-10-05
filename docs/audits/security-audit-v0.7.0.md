# Security audit — v0.7.0 launch hardening (Phase 1)

Date: 2026-08-03
Branch: `launch-hardening` (from `bugfix7-player`)
Scope: RLS/migration audit, `payment-screenshots` bucket, client console logging, `iapHelpers.ts`, `generate-stream-upload` rate limiting, `UPI_ID` config, CORS env vars.

**Note on methodology:** the original task brief assumed specific findings (9 files with `console.log`, a `TODO` in `iapHelpers.ts`). Before applying any fix, this audit re-verified against the actual current codebase rather than trusting the brief — several assumptions turned out to be stale (see below). Findings and severities below reflect what was actually found, not what was assumed.

---

## 1. RLS audit

### 1a. Migrations reviewed

`supabase/migrations/`: v40 (db hardening), v41 (storage hardening), v42 (player prefs), v43 (channel-media RLS), v44 (series_id type change).

These are not the only source of schema/RLS truth — this project also has ~30 older flat-file migrations directly under `supabase/` (e.g. `migration_v2.sql` … `migration_v39b_grants_tighten.sql`) and a `supabase/schema.sql` baseline, applied historically via dashboard/CLI rather than tracked in `supabase/migrations/`. The audit below covers the **full current schema**, not just v40–v44, because limiting the review to 5 files would have missed the tables that actually hold payment and user data.

**Finding (Low, process): migration tracking is split** between `supabase/migrations/` (CLI-tracked) and loose `supabase/migration_vNN_*.sql` files (manually applied, not tracked by `supabase db push`). Recommend consolidating into `supabase/migrations/` going forward so schema drift can't happen silently. Not fixed in this pass (structural change, out of scope for a security fix).

### 1b. Full table inventory — RLS status

| Table | RLS enabled | Source | Notes |
|---|---|---|---|
| `profiles` | ✅ | schema.sql | own-row select/update |
| `channels` | ✅ | schema.sql | public-active select, member select, owner CUD |
| `files` | ✅ | schema.sql | own + public-channel-file select |
| `channel_members` | ✅ | schema.sql | own-row select/insert/delete |
| `transfers` | ✅ | schema.sql | own-row (all) |
| `content_reports` | ✅ | schema.sql | insert own, select own — **no admin-read policy found** (see finding below) |
| `channel_posts` | ✅ | v2 | |
| `app_settings` | ✅ | v12, hardened in v40 | public read (`USING true`) + v40 added admin-only write policy |
| `watch_history` | ✅ | v15 | |
| `channel_videos` | ✅ | v18 | |
| `subscription_plans` | ✅ | v20 | |
| `subscription_requests` | ✅ | v21 | holds `upi_transaction_id`, `screenshot_path` |
| `user_preferences` | ✅ | v42 | own-row only |
| `subtitles` | ✅ | v42 | public read for approved content, owner/admin write |
| `stream_videos` | ⚠️ no RLS | v41 | **Intentional** — internal Cloudflare UID tracking table, no GRANTs to `anon`/`authenticated` at all, so PostgREST can't expose it regardless of RLS. Verified no stray GRANT exists anywhere in the migration history. Documented in the migration itself. |
| `upload_rate_limit_log` | ⚠️ no RLS | v45 (new, this audit) | Same pattern as `stream_videos` — service-role only, no client GRANTs. |

**Result: every table holding user/PII/payment data has RLS enabled.** The two RLS-less tables are deliberate internal service-role-only tables with no client grants, which is the correct pattern for that use case (not a gap).

**Finding (Low): `content_reports` has no admin-read policy.** Only the reporter can see their own reports (`for select using (auth.uid() = reporter_id)`). If admin review of reports currently happens (e.g. via a service-role admin script/dashboard), this is fine; if it's meant to happen through the app's normal authenticated client, admins currently can't list reports. Flagging as a functional gap, not a security hole — no fix applied since it's ambiguous whether this is intended (may be handled by database-console review only).

### 1c. `USING (true)` policies

Searched the full migration history for bare `USING (true)`/`FOR SELECT ... TO public` policies that don't gate on role:
- `app_settings` SELECT policy is public-read (`USING (true)`), but this is a config table (feature flags, min version, etc.) — public read is intentional, and v40 already locked down writes to admins only. **Verified correct, not a gap.**
- `channel-media` bucket SELECT policy (storage, v43) is `TO public USING (bucket_id = 'channel-media')` — intentional, this bucket holds public thumbnails/channel art and the bucket itself is `public: true`. **Verified correct.**
- No other bare `USING (true)` policies found on tables containing PII, payment, or private content.

### 1d. GRANT audit

v39/v39b (loose files, applied earlier) already revoke `PUBLIC`/`anon` execute on `record_post_view`, `increment_storage_used`, `decrement_storage_used`, restricting to `authenticated`. v40 extends this pattern to 25 functions via a dynamic `pg_proc`-driven loop (idempotent, skips functions that don't exist). Spot-checked: no RPC in the current schema grants execute to `anon` except where anonymous access is the actual intent (none found).

---

## 2. `payment-screenshots` bucket RLS

Verified against `supabase/migration_v23_create_payment_screenshots_bucket.sql` (the source of truth for this bucket's policies — note this predates the `supabase/migrations/` folder, so it's not one of v40–v44, but it's the bucket the task asked about):

| Policy | Effect |
|---|---|
| Owner upload (INSERT) | `bucket_id = 'payment-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text` |
| Owner read own (SELECT) | same folder-prefix check |
| Admin read all (SELECT) | `EXISTS (... profiles ... is_admin = true)` |
| Admin write (UPDATE/DELETE) | same admin check |
| Bucket `public` flag | `false` (private) |

**Result: matches the required spec exactly** — owner-only read/write scoped by folder prefix, admin read for manual review, no public access. No fix needed; documenting as verified.

---

## 3. Client-side console logging cleanup

**Stale assumption in the task brief:** the brief listed 9 files as having `console.log` statements needing a `__DEV__` gate. Actual audit found:
- None of the 9 files contained `console.log` — each had exactly **one `console.error(err)`** in a data-fetch catch block (a different, more defensible pattern than a verbose debug `console.log`).
- 6 **additional** files not in the original list also had ungated `console.log`/`warn`/`error` calls: `components/SearchModal.tsx`, `components/ErrorBoundary.tsx` (see note below), `hooks/useWatchHistory.ts`, `lib/channelVideos.ts`, `lib/notifications.ts`, `lib/services/playerPrefs.ts`, `lib/uploadQueue.persistence.ts`.

**Severity: Low–Medium**, not Critical. None of the messages hardcode PII/tokens directly, but several log the raw `error`/`err` object from a Supabase call. Postgres constraint-violation errors can sometimes embed the offending value in the `DETAIL` field (e.g. a unique-email violation could echo the email back in the error detail), so logging raw error objects is a real (if lower-probability) PII exposure vector in a release build — worth gating even though no concrete leak was found in the current code.

**Fix applied:** wrapped every one of the 15 files' console calls in `if (__DEV__) { ... }` (or `if (cond && __DEV__)` for single-line guards), so nothing prints in release builds. Files changed:
`app/(tabs)/channels/index.tsx`, `app/(tabs)/explore.tsx`, `app/(tabs)/profile.tsx`, `app/admin/pending-channel-content.tsx`, `app/admin/pending-channels.tsx`, `app/admin/subscription-requests.tsx`, `app/channel/manage/[id].tsx`, `app/my-subscription.tsx`, `app/my-videos.tsx`, `components/SearchModal.tsx`, `hooks/useWatchHistory.ts`, `lib/channelVideos.ts`, `lib/notifications.ts`, `lib/services/playerPrefs.ts`, `lib/uploadQueue.persistence.ts`.

**Deliberately NOT changed: `components/ErrorBoundary.tsx`.** Its `console.error('[ErrorBoundary]', error)` is the last line of defense for diagnosing a production crash. Gating it behind `__DEV__` would make production crashes completely silent with nothing to replace it. Phase 5 (robustness/error tracking) is the right place to decide whether this becomes a `Sentry.captureException` call instead — leaving it as-is until then.

**Also NOT changed: `supabase/functions/*/index.ts` (`delete-account`, `generate-stream-upload`).** These are server-side Deno edge functions — their `console.error` output goes to Supabase's function logs (dashboard, owner-only visibility), which is normal server-side observability, not a client-side leak. `__DEV__` doesn't exist in the Deno runtime either. Out of scope for this fix.

---

## 4. `lib/iapHelpers.ts` TODO

**Stale assumption:** the brief said this file has a TODO to fix. **Actual state: no TODO exists in this file.** It's a small, clean 16-line module (`getUpiPaymentUrl`, `formatUpiAmount`) with no comments flagged TODO/FIXME. No fix needed — noting this so the "TODO" item isn't silently dropped without explanation.

---

## 5. Rate limiting — `generate-stream-upload`

**Finding (Medium): no rate limit existed.** Any authenticated user with upload permission could call this function as fast as the client allowed, each call consuming a Cloudflare Stream API request.

**Fix applied:**
- New migration `supabase/migrations/20260803120000_v45_upload_rate_limit.sql` — adds `public.upload_rate_limit_log` (user_id, created_at), indexed on `(user_id, created_at DESC)`. No RLS/GRANTs to client roles (same pattern as `stream_videos`) — only the edge function's service-role key can read/write it.
- Edge function now counts this user's rows in the last 60 seconds before making the Cloudflare API call; if `>= 10`, returns **HTTP 429** with a clear message, before spending any Cloudflare quota. Logs the attempt right after the permission check passes (not on every raw request, so validation failures like bad file size don't count against the limit).
- **Not yet applied to the live DB** — the migration file is written but not run (per "no DB writes" rule). Needs `supabase db push --linked` (or dashboard SQL) before the rate limit takes effect in production.

---

## 6. `UPI_ID` — app.json → env

**Context:** `UPI_ID` is a UPI *payment address* (like a PayPal.me link) — it's meant to be shown to end users so they can pay, so this is a config-hygiene fix, not a secret-leak fix (a UPI ID isn't a credential).

**Fix applied:**
- `lib/config.ts`: `upiId` now reads `process.env.EXPO_PUBLIC_UPI_ID` first, falling back to the existing `app.json` `extra.UPI_ID` mechanism (unchanged) for dev/back-compat.
- `.env.example`: documented the new `EXPO_PUBLIC_UPI_ID` var.
- `app.json`'s `extra.UPI_ID` value **left in place** as the fallback (per brief: "with fallback to the current value for dev") — not removed, since removing it would break any build that doesn't set the new env var.
- This project uses static `app.json` (not `app.config.js`), so `EXPO_PUBLIC_*` vars (already the established pattern here for Supabase/Cloudflare config) is the lowest-risk way to make this overridable per environment without restructuring the whole config file.

---

## 7. CORS env vars — `ALLOWED_ORIGINS` / `APP_ORIGIN`

Both edge functions (`generate-stream-upload`, `delete-account`) already read these from `Deno.env.get(...)` and fall back to `"*"` if unset. **For production, these must be set in the Supabase dashboard → Edge Functions → Secrets:**

| Var | Production value should be |
|---|---|
| `APP_ORIGIN` | The single canonical origin the mobile app calls from (for a native app calling via `fetch`, this is typically not browser-Origin-checked the same way a web app would be — confirm with the Supabase project owner whether these functions are ever called from a web context; if native-app-only, `APP_ORIGIN` mainly matters if there's a companion web client). |
| `ALLOWED_ORIGINS` | Comma-separated list of any web origins that call these functions directly (e.g. `https://streamly-legal.vercel.app` if that surface ever calls them — currently doesn't appear to). |

**Not verified in this pass:** whether these are actually set in the live Supabase project (no dashboard access from this session). **Action for the user:** confirm in Supabase Dashboard → Project Settings → Edge Functions → Secrets that `ALLOWED_ORIGINS` and `APP_ORIGIN` are set for production, even if the current risk is low (native app calls aren't Origin-restricted the way browser calls are — this mainly future-proofs against a web client being added later).

---

## Summary of changes in this commit

| File | Change |
|---|---|
| 15 files across `app/`, `components/`, `hooks/`, `lib/` | Gated console logging behind `__DEV__` |
| `supabase/functions/generate-stream-upload/index.ts` | Added rate limiting (10/min/user), 429 response |
| `supabase/migrations/20260803120000_v45_upload_rate_limit.sql` | New table for rate-limit tracking (not yet applied to live DB) |
| `lib/config.ts`, `.env.example` | `UPI_ID` now overridable via `EXPO_PUBLIC_UPI_ID` |
| `docs/security-audit-v0.7.0.md` | This report |

## What's left for the user

1. Run the new v45 migration against the live DB (`npx supabase db push --linked`, or paste into dashboard SQL editor) — rate limiting has no effect until this is applied.
2. Confirm `ALLOWED_ORIGINS` / `APP_ORIGIN` are set in the Supabase dashboard for production.
3. Decide whether `content_reports` needs an admin-read RLS policy, or whether admin review happens outside RLS (e.g. database console) — currently no admin can query reports through the normal client.
4. Optional/non-blocking: consolidate the ~30 loose `supabase/migration_vNN_*.sql` files into `supabase/migrations/` so future schema state isn't split across two tracking mechanisms.
