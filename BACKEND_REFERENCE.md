# Cloudlynk Backend Reference

> **For the technical handoff.** Complete inventory of Supabase + Cloudflare + app config. Read this when onboarding a new dev or answering architecture questions.

---

## 1. Supabase project

| | |
|---|---|
| **Project URL** | `https://wdtwjiixuueqejfraaod.supabase.co` |
| **Project ref** | `wdtwjiixuueqejfraaod` |
| **Region** | (verify in dashboard) |
| **CLI** | `npx supabase` (linked, no DB password needed for `db push` / `db query`) |
| **Auth** | GoTrue (email + password) |
| **Storage** | S3-compatible (TUS resumable upload) |

**Environment variables (in `.env`):**

```
EXPO_PUBLIC_SUPABASE_URL=https://wdtwjiixuueqejfraaod.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon JWT>
SUPABASE_SECRET_KEY=<service-role key>
SUPABASE_SERVICE_ROLE_KEY=<auto-injected into edge functions>
```

---

## 2. Database tables (15 in `public` schema)

| Table | Purpose | Notable columns |
|---|---|---|
| `app_settings` | App-wide config (feature flags, version) | key, value (jsonb) |
| `channel_members` | User ↔ channel join table | channel_id, user_id, role, joined_at |
| `channel_posts` | Posts within a channel (thumbnails, video_url, trailer_url, body) | channel_id, author_id, title, body, content_type, video_url, thumbnail_url, trailer_url, media_url, status (pending/approved/rejected/draft), genre, duration_min, season_number, episode_number |
| `channel_videos` | Long-form videos for a channel | channel_id, uploaded_by, storage_path, thumbnail_path, title, status, mime_type, file_size_bytes, duration_seconds |
| `channels` | Channel metadata | owner_id, name, description, status (pending/active/suspended/rejected), member_count, avatar_url, link, category (v47) |
| `content_reports` | Moderation queue: reports against content, users, or copyright | reporter_id, channel_id, post_id, reported_user_id, reason, target_type ('content'/'user'/'copyright'/'other'), status, resolution, moderator_note, reviewed_by, reviewed_at |
| `user_blocks` | User-to-user blocking (v46) | blocker_id, blocked_id — enforced in `channel_posts` SELECT RLS, not just client-side |
| `files` | Cloud tab file metadata | user_id, storage_path, name, size_bytes, category, mime_type |
| `notifications` | User notifications | user_id, type, title, body, read, link |
| `profiles` | User profile + roles | id (=auth.users.id), email, full_name, avatar_url, is_admin, can_upload_content, plan_status, plan_started_at, plan_expires_at, storage_used, storage_limit (**server-computed, flat 15GB for all accounts as of v52 — see §17**), birth_year, account_status ('active'/'suspended'/'banned', v48), terms_accepted_at, terms_version, community_guidelines_version, privacy_version (v48) |
| `series` | Long-form series (parent for episodes) | owner_id, title, description, thumbnail_url |
| `stream_videos` | **Cloudflare Stream UID tracking** (v41) | user_id, stream_uid (UNIQUE), context, post_id, created_at |
| `subscription_plans` | Plan catalog | code, name, price_inr, duration_days, features |
| `subscription_requests` | UPI payment requests awaiting admin approval | user_id, plan_id, amount_inr, upi_transaction_id, screenshot_path, status, reviewed_by, reviewed_at |
| `transfers` | File upload transfers (in-progress tracking) | user_id, file_id, status, bytes_uploaded |
| `watch_history` | User watch history | user_id, post_id, watched_at, progress_seconds |

**RLS:** **61 policies** on public tables. Every table is RLS-enabled; service-role key bypasses (edge functions only). All client calls go through RLS.

---

## 3. RPC functions (25 in `public` schema)

### Auth + user lifecycle
| Function | Purpose |
|---|---|
| `handle_new_user` (trigger) | Auto-creates `profiles` row when `auth.users` row is created |
| `handle_updated_at` (trigger) | Auto-updates `updated_at` columns |

### Subscription + billing
| Function | Purpose |
|---|---|
| `get_my_subscription_status` | Returns current user's plan + active status + latest request |
| `approve_subscription_request(req_id, admin_id)` | Admin approves a payment → activates plan |
| `reject_subscription_request(req_id, reason, admin_id)` | Admin rejects with reason |
| `increment_storage_used(user_id, bytes)` / `decrement_storage_used` | Tracks storage usage counter |

### Channels
| Function | Purpose |
|---|---|
| `can_post_to_channel(channel_id)` | Returns bool — does the caller have permission to post here? |
| `is_owner_or_admin(channel_id)` | Returns bool — caller owns or admins this channel |
| `join_channel(channel_id)` / `leave_channel(channel_id)` | Membership ops |
| `increment_channel_members(channel_id)` / `update_channel_post_count(channel_id)` | Counter maintenance |
| `get_my_channel_posts(channel_id)` | Returns caller's posts in a channel (including drafts) |
| `update_channel(channel_id, ...)` / `delete_channel(channel_id)` | Owner mutations |
| `activate_approved_channels` | Auto-activates channels when owner is verified |

### Content approval
| Function | Purpose |
|---|---|
| `approve_post(post_id, admin_id)` / `reject_post(post_id, reason, admin_id)` | Admin content moderation |
| `approve_channel_content(channel_id, admin_id)` / `reject_channel_content(channel_id, reason, admin_id)` | Channel-level moderation |
| `record_post_view(post_id)` | Increments view counter |

### Demo / dev (kept per user decision)
| Function | Purpose |
|---|---|
| `demo_reset()` | Wipes runtime state (subscription_requests, channel memberships, post statuses). **UI-gated behind `__DEV__`** but still callable via raw RPC — flagged for v42 cleanup. |

### User data
| Function | Purpose |
|---|---|
| `export_my_data` | GDPR data export (returns all user data as JSON) |

### Compliance / moderation (v46–v48 — see §13 for the full picture)
| Function | Purpose |
|---|---|
| `accept_terms(terms_version, guidelines_version, privacy_version)` | Records the caller's versioned acceptance. Call at signup and again whenever `lib/compliance.ts`'s `POLICY_VERSIONS` bumps. |
| `can_create_ugc(user_id)` | Returns bool — used inside the `channels`/`channel_posts` INSERT RLS policies. Not usually called directly by the client, but useful for a client-side pre-check. |
| `admin_resolve_report(report_id, action, resolution, moderator_note)` | Admin-only. `action` ∈ dismiss / remove_content / suspend_channel / suspend_user / ban_user / warn. Verifies `is_admin` itself — do not trust a client-side admin check alone. |
| `current_policy_versions()` | Returns the server's source-of-truth version strings — keep `lib/compliance.ts`'s `POLICY_VERSIONS` constant matching this. |

---

## 4. Storage buckets (5 total)

| Bucket | Public | Size cap | Allowed MIME | Purpose | RLS |
|---|---|---|---|---|---|
| **`user-files`** | ❌ | 1 GB | images, videos, audio, pdf, doc, xls, zip, csv, txt, octet-stream | Personal cloud storage | Owner-only via `foldername[1] = auth.uid()` |
| **`payment-screenshots`** | ❌ | 5 MB | image/jpeg, image/png, image/webp | UPI payment proof | Owner read + admin full access |
| **`channel-videos`** | ❌ | 30 MB | video/mp4, video/quicktime, video/x-msvideo, video/webm | Long-form channel videos | Owner + admin + approved-read public |
| **`channel-media`** | ✅ | 100 MB | images + video (mp4/quicktime/webm) | Public post thumbnails + media | Public read, owner write/delete |
| **`demo-builds`** | ❌ | none | (any) | Test bucket for build artifacts | **OUT OF SCOPE** — not in app flow |

**RLS:** **13 policies** across all buckets. Most restrictive: only `foldername[1] = auth.uid()` can read/write own folder.

**v41 hardening (2026-06-25):**
- `channel-media` INSERT now requires `foldername[1] = auth.uid()` (was: any authenticated user could upload to any path)
- `channel-media` admin full-access policy added (admins can now delete storage objects during moderation)
- `user-files` policy role changed `{public}` → `{authenticated}` (was functionally equivalent due to `auth.uid() IS NOT NULL` check, but semantically correct)

---

## 5. Edge functions (6 total — 2 originally deployed + 4 added for compliance/payments)

### `delete-account`

**URL:** `https://wdtwjiixuueqejfraaod.supabase.co/functions/v1/delete-account`

**Purpose:** Deletes a user account + all their data + all their storage.

**Flow:**
1. Verify auth header (user's JWT)
2. Gather all storage paths from DB **before** deleting rows
3. Delete DB rows in this order: watch_history, notifications, content_reports, subscription_requests, channel_members, channel_posts, channel_videos, files, transfers, channels, **stream_videos**, profiles
4. Remove storage objects from 4 buckets (user-files, payment-screenshots, channel-videos, channel-media)
5. Call Cloudflare Stream API `DELETE /accounts/{id}/stream/{uid}` for each tracked UID
6. Delete the auth user via `supabase.auth.admin.deleteUser(id)`

**v41 fix:** `channel_posts.media_url` and `thumbnail_url` are bare paths (not full URLs). Old code used `extractStoragePath()` which only matched full Supabase URLs → silently skipped bare paths. Fixed: bypass `extractStoragePath` for these columns, push value directly.

### `generate-stream-upload`

**URL:** `https://wdtwjiixuueqejfraaod.supabase.co/functions/v1/generate-stream-upload`

**Purpose:** Generates a Cloudflare Stream direct-upload URL. Client uploads video file directly to Cloudflare (faster, bypasses Supabase 50MB cap).

**Flow:**
1. Verify auth header
2. Validate input (fileSize, fileName, channelId)
3. Permission check: either caller has `can_upload_content=true` OR caller is admin OR caller can post to the specified channel
4. Call Cloudflare `POST /accounts/{id}/stream/direct_upload` with `meta: { userId, fileName, channelId }`
5. Insert `stream_videos` row to track the UID (v41)
6. Return `{ uploadURL, uid }` to client

**Cloudflare Stream limits:**
- Max file size: 180 MB (`MAX_FILE_SIZE_BYTES`)
- Max duration: 7200 seconds (2 hours)
- Allowed extensions: mp4, mov, m4v, webm, mkv

### `stream-playback-token` (new, not yet deployed)

**Purpose:** Mints a short-lived (~6h) signed Cloudflare Stream playback URL
for a **Premium** post's video, only after re-deriving server-side that the
signed-in caller is entitled to it. Free videos never call this.

**Flow:** POST `{ postId }` + auth header →
1. caller-scoped client reads `channel_posts` for `postId` — `channel_posts_select_v52` RLS already enforces approved status / channel membership or public / **`access_level='free'` OR caller `plan_status IN ('active','lifetime')`**. No row → 404 (not distinguished from "not allowed").
2. `access_level !== 'premium'` → 400 (client shouldn't have called).
3. explicit re-check of caller's own `profiles.plan_status` / `plan_expires_at` (defence in depth — active-not-expired, or lifetime).
4. if `stream_videos.signed_locked` is not true for this UID: POST the Cloudflare video with `requireSignedURLs:true` (idempotent), then set the flag.
5. POST `.../stream/{uid}/token` with `exp` ≈ now+6h → build `https://customer-<CODE>.cloudflarestream.com/{uid}/manifest/video.m3u8?token=...` and return `{ url }`.

Every rejection returns the same generic `"This video isn't available."` so the error can't probe which posts are Premium.

**Needs:** `CLOUDFLARE_STREAM_CUSTOMER_CODE` secret (the `customer-<CODE>` playback subdomain — `cw3q2266ctwnl4hi` for this account; found via `GET /accounts/{id}/stream`). Reuses `CLOUDFLARE_STREAM_ACCOUNT_ID` / `CLOUDFLARE_STREAM_API_TOKEN` (the token already has Stream:Edit — it does `direct_upload`). Deploy: `npx supabase functions deploy stream-playback-token` (keep JWT verification **on**). Migration `v54` adds `stream_videos.signed_locked`.

### `verify-play-receipt` (new, not yet deployed)

**Purpose:** Server-side Google Play purchase verification — the client never gets to unilaterally decide "I paid." Called by `GooglePlayIapService.purchasePlan`/`verifyReceipt` (`lib/services/iap.ts`).

**Flow (v50):** verifies JWT → calls Play Developer API `purchases.subscriptionsv2.get` (via `../_shared/play-billing.ts`) → if valid, acknowledges the purchase server-side (Google auto-refunds anything unacknowledged after 3 days) → upserts a row in `iap_purchases` (so `play-rtdn-webhook` can find this user again later) → sets `profiles.plan_status`/`plan_expires_at` (via service-role, which the v48 `profiles` trigger allows) → returns `{ valid, expiresAt }`.

**Needs before it will actually work:** `GOOGLE_SERVICE_ACCOUNT_JSON` secret (a Play Console service account with Play Developer API access — Play Console > Users and permissions), and the `cloudlynk_premium` subscription product with its four base plans (`silver-7d` / `gold-1m` / `platinum-6m` / `diamond-1y`) created in Play Console. Deploy with `npx supabase functions deploy verify-play-receipt` (keep JWT verification on — this one should only be callable by a signed-in app user). `RECEIPT_VERIFIER_URL` in `app.json` already points to its URL. Full checklist: §15.

### `play-rtdn-webhook` (new, not yet deployed)

**Purpose:** Receives Google Play Real-time Developer Notifications (renewals, cancellations, refunds, grace periods, account holds) so entitlements stay correct without the user having to reopen the app. See §15 for the full setup checklist (Pub/Sub topic, push subscription, shared-secret auth, deploy flags — all different from the other functions since Pub/Sub can't send a Supabase JWT).

### `account-deletion` (new, not yet deployed)

**Purpose:** The *external* (no app install required) account-deletion page Play requires, separate from the in-app "Delete Account" screen. Serves a small self-contained HTML page: email → magic-link sign-in → calls the existing `delete-account` function. No new deletion logic — same function, same guarantees, different entry point.

**Deploy:** `npx supabase functions deploy account-deletion --no-verify-jwt` (must be reachable without a prior Supabase session, since a browser visitor won't have one yet). Its URL (`https://<project-ref>.supabase.co/functions/v1/account-deletion`) is what goes in Play Console's Data Safety "Account deletion" field and in the privacy policy.

### `legal-pages`

**Purpose:** Hosts the Privacy Policy, Terms of Service, Community Guidelines, Refund Policy, and
Copyright & IP Policy as public pages with real URLs — Play Console's listing requires a working external
privacy policy URL, and the others benefit from one too. Content lives in `privacy.ts` / `terms.ts` /
`guidelines.ts` / `refund.ts` / `copyright.ts` inside the function directory as plain HTML strings,
separate from the routing (`index.ts`) and shared page chrome (`shell.ts`), so wording can be edited
without touching code. Legal identity is set once in `shell.ts`: `DEVELOPER_NAME = 'Sahil Chandpara'`,
`SUPPORT_EMAIL = 'support@cloudlynk.app'`. Governing law (India / courts of Surat, Gujarat) is stated in
`terms.ts` §21.

**Deploy:** `npx supabase functions deploy legal-pages --no-verify-jwt`. URLs:
- `https://<project-ref>.supabase.co/functions/v1/legal-pages/privacy`
- `https://<project-ref>.supabase.co/functions/v1/legal-pages/terms`
- `https://<project-ref>.supabase.co/functions/v1/legal-pages/guidelines`
- `https://<project-ref>.supabase.co/functions/v1/legal-pages/refund`
- `https://<project-ref>.supabase.co/functions/v1/legal-pages/copyright`

`app.json`'s `PRIVACY_POLICY_URL` / `TERMS_URL` / `COMMUNITY_GUIDELINES_URL` / `REFUND_POLICY_URL` /
`COPYRIGHT_POLICY_URL` all point here, and `lib/config.ts` exposes them. The in-app screens
(`app/privacy.tsx`, `terms.tsx`, `community-guidelines.tsx`, `refund-policy.tsx`, `copyright.tsx`) are thin
launchers that open the hosted page in an in-app browser — single source of truth.

**⚠️ Not legal advice:** this content is a strong starting point, but a lawyer reviewing it before you rely
on it for an actual Play submission is worth the cost for something this consequential. `shell.ts` still
has no registered address behind `DEVELOPER_NAME` — add one if your jurisdiction/Play account requires a
full legal name and address on the policy.

---

## 6. Cloudflare Stream integration

**Account ID:** stored in edge function env as `CLOUDFLARE_STREAM_ACCOUNT_ID`
**API Token:** stored as `CLOUDFLARE_STREAM_API_TOKEN`
**Used for:** video transcoding + playback CDN
**Tracking:** `stream_videos` table (v41) — service-role writes only, no client RLS

**v41 backfill:** 18 distinct Stream UIDs backfilled from existing `channel_posts.video_url` rows. UNIQUE constraint on `stream_uid` collapses duplicate UIDs across posts (10 posts share UIDs with other posts).

**Cost note:** Cloudflare bills per-minute-stored + per-minute-delivered. Without v41, every deleted user's videos would have stayed on Cloudflare forever. v41 prevents this.

---

## 7. Migrations (41 total)

**Naming:** Two conventions in repo (consolidating to timestamp-prefix):
- **OLD:** `supabase/migration_v{N}_{name}.sql` (e.g., `migration_v40_db_hardening.sql`) — IGNORED by `db push` (no timestamp prefix)
- **NEW:** `supabase/migrations/YYYYMMDDHHMMSS_{name}.sql` (e.g., `20260622110000_migration_v40_db_hardening.sql`) — picked up by CLI

**Active migrations (live in DB):**

| Migration | Purpose |
|---|---|
| v2, v4, v5, v7, v8 | Early schema (profiles, channels, posts) |
| v9 | Plan fix |
| v10 | Organic RLS (user-content policies) |
| v11 | Content visibility rules |
| v12 | Geo settings |
| v14 | Picsum thumbnails (placeholder seed) |
| v15 | Watch history table |
| v16 | `is_short` flag |
| v17 | Admin can delete channels |
| v18 | `channel_videos` table |
| v19 | `channel-videos` storage policies |
| v20 | Subscription plans |
| v21 | Subscription state machine |
| v22 | Payment screenshots storage policies |
| v23 | Create payment-screenshots bucket |
| v24 | Admin profile update |
| v25 | Subscription approval function (SECURITY DEFINER) |
| v26 | Channel join plan-status check |
| v27 | Post approval function |
| v28 | Secure join function |
| v29 | `export_my_data` |
| v30 | Fix `export_my_data` |
| v31 | `demo_reset()` function |
| v32 | Fix `demo_reset()` |
| v33 | Seed 10 shorts |
| v34 | Channel content approval |
| v35 | Owner or admin check |
| v36 | Owner can post |
| v37 | Public shorts RLS |
| v38 | Post view tracking |
| v39 | Security hardening |
| v39b | Grants tighten |
| **v40** (2026-06-22) | DB hardening (SECURITY DEFINER functions, policy consolidation) |
| **v41** (2026-06-25) | **Storage hardening** — stream_videos table + 3 policy changes |

**v41 details (the latest):**
- Creates `stream_videos` table with `UNIQUE(stream_uid)`, indexes on user_id and post_id
- Backfills 18 distinct UIDs from `channel_posts.video_url` (regex `^[a-f0-9]{32}$` excludes test artifacts)
- Drops + recreates `channel-media` INSERT policy with `foldername[1] = auth.uid()` constraint
- Adds `channel-media admin full access` policy (auth.uid is admin)
- Drops + recreates `user-files` policy with `roles={authenticated}` (was `{public}`)
- Idempotent bucket INSERT (ON CONFLICT DO NOTHING) for `user-files` + `channel-media` (dashboard-created buckets, no migration existed)
- `NOTIFY pgrst, 'reload schema';` at end (forces PostgREST cache reload)

---

## 8. Auth setup

**Provider:** Email + password (Supabase Auth / GoTrue)
**JWT:** legacy format (`eyJ...`) — new `sb_publishable_*` keys rejected by PostgREST
**Sign-up trigger:** `handle_new_user` creates a `profiles` row with `is_admin=false, can_upload_content=false, plan_status='free'`
**Session storage:** AsyncStorage on the client (`@react-native-async-storage/async-storage`)
**Auth helpers:** `lib/supabase.ts` + `hooks/useAuth.ts`

---

## 9. App config (`app.json` extra)

```json
{
  "APP_ENV": "production",
  "IAP_PROVIDER": "noop",
  "GOOGLE_PLAY_PACKAGE_NAME": "",
  "RECEIPT_VERIFIER_URL": "",
  "UPI_ID": "cloudlynk@upi",
  "UPI_MERCHANT_NAME": "Cloudlynk",
  "ADMOB_APP_ID": "",
  "ADMOB_BANNER_ID": "",
  "ADMOB_INTERSTITIAL_ID": "",
  "SENTRY_DSN": "",
  "SUPPORT_EMAIL": "support@cloudlynk.in",
  "PRIVACY_POLICY_URL": "https://cloudlynk.in/privacy",
  "TERMS_URL": "https://cloudlynk.in/terms",
  "PAYMENT_SCREENSHOTS_BUCKET": "payment-screenshots"
}
```

**Read by:** `lib/config.ts` (with helpers `isIapLive()`, `isUpiLive()`, `isAdmobLive()`, `isSentryLive()`)

**Production gaps (need filling before Play Store submission):**
- `GOOGLE_PLAY_PACKAGE_NAME` — currently empty
- `ADMOB_*` — currently empty
- `SENTRY_DSN` — currently empty
- `PRIVACY_POLICY_URL` — placeholder, needs hosting

---

## 10. v41 storage hardening (shipped 2026-06-25)

**Motivating audit (Batch 15D):** Found 7 issues across storage layer. Highest impact: `delete-account` was silently skipping `channel_posts.media_url` and `thumbnail_url` because `extractStoragePath()` only matched full Supabase URLs, but those columns stored bare paths.

**Shipped (Batch 16 + 17):**
1. **Bare-path fix in `delete-account`:** bypasses `extractStoragePath()` for `media_url` + `thumbnail_url` (and `series.thumbnail_url`), pushes value directly with HTTP-URL guard
2. **`stream_videos` tracking:** new table tracks Cloudflare Stream UIDs by user. `delete-account` calls Cloudflare `DELETE /stream/{uid}` for each row → no more orphaned videos billing forever
3. **`channel-media` INSERT tightened:** was open to any authenticated user uploading to any path; now requires `foldername[1] = auth.uid()`
4. **`channel-media` admin full access:** new policy lets admins delete storage objects during moderation
5. **`user-files` policy role fix:** `{public}` → `{authenticated}` (semantic correctness, functionally equivalent)
6. **Dashboard bucket docs:** `user-files` and `channel-media` now have idempotent migration entries (so the project can be cloned and rebuilt)

**Verified:**
- `npx tsc --noEmit` — clean
- `npm run lint` — clean (after adding `tmp/**`, `scripts/**` to ESLint ignore)
- 15E re-test: bare-path channel-media cleanup now works (1 → 0)
- Stream cleanup smoke test: 16/16 PASS, UIDs created on upload, deleted on user deletion
- No regressions in existing flows

**Deferred to v42:**
- `lib/posts.ts` Phase 4 — link `stream_videos.post_id` after `createPost` insert. Deferred because it requires `GRANT UPDATE ON stream_videos TO authenticated` + an RLS policy, both of which would need careful security review.
- `demo_reset()` function in DB — kept per user decision, UI-gated, but still callable via raw RPC. Drop in v42.

---

## 11. Code organization

```
D:\Joliffy\jollify\
├── app/                          # Expo Router screens
│   ├── (auth)/                   # login, signup
│   ├── (tabs)/                   # 4 bottom tabs (cloud, explore, channels, profile)
│   ├── admin/                    # admin-only screens
│   ├── channel/                  # channel management
│   └── *.tsx                     # standalone screens (subscription, settings, legal)
├── components/                   # shared UI components
│   ├── ContinueWatchingRow.tsx
│   ├── ErrorBoundary.tsx
│   ├── SearchModal.tsx
│   ├── CloudlynkLogo.tsx
│   └── VideoPlayerOverlay.tsx
├── lib/                          # services + utilities
│   ├── categories.ts
│   ├── channelVideos.ts          # Channel video upload pipeline
│   ├── channels.ts               # Channel CRUD
│   ├── config.ts                 # App config from app.json extra
│   ├── feed.ts                   # Explore feed queries
│   ├── iapHelpers.ts             # UPI payment URL generation
│   ├── notifications.ts
│   ├── posts.ts                  # Post CRUD + media upload
│   ├── queryClient.ts            # React Query setup
│   ├── search.ts
│   ├── settings.ts
│   ├── storage.ts                # File upload + signed URLs
│   ├── stream.ts                 # Cloudflare Stream client
│   ├── subscriptionService.ts
│   └── supabase.ts               # Supabase client init
├── hooks/
│   ├── useAuth.ts
│   └── useFiles.ts
├── constants/
│   └── theme.ts                  # Colors, spacing, typography
├── supabase/
│   ├── functions/                # Edge functions (Deno)
│   │   ├── delete-account/index.ts
│   │   └── generate-stream-upload/index.ts
│   └── migrations/               # SQL migrations (timestamp-prefixed)
├── android/                      # Native Android project
├── app.json                      # Expo config
├── package.json                  # v0.6.0
├── tsconfig.json
└── eslint.config.js
```

**Total LOC:** ~2,000 lines in `app/`, ~3,000 lines in `lib/`, ~1,000 lines in `components/`, ~200 lines in edge functions, ~500 lines per migration file (varies)

---

## 12. Operational notes

**Backups:** Supabase automatic daily backups. Point-in-time recovery available on Pro plan.

**Monitoring:** None configured yet. Sentry DSN empty. Recommended: add Sentry before Play Store launch.

**Logs:** `npx supabase functions logs delete-account --limit 50` and similar for `generate-stream-upload`.

**Secrets management:**
- Local: `.env` (gitignored)
- Production secrets: `npx supabase secrets list`
- Edge function env: auto-injected (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) + manual (`CLOUDFLARE_STREAM_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`)

**Deployment:**
```bash
# Deploy a single function
npx supabase functions deploy delete-account

# Apply migrations
npx supabase db push --linked --include-all

# Run an ad-hoc query
npx supabase db query --linked --output json "SELECT ..."
```

**Rebuilding the APK:**
```bash
cd android
./gradlew clean
./gradlew assembleRelease   # APK
./gradlew bundleRelease    # AAB for Play Store
```

---

## 13. Ads + Cloudflare geo-blocking (v49)

**Ads (AdMob), admin-configurable.** `react-native-google-mobile-ads` was already a dependency but fully
stubbed out. It's now wired for real in `lib/ads.ts`, driven by `lib/adsConfig.ts`, which reads/writes
`app_settings` (admin-write RLS added in v49 — previously `app_settings` had public SELECT but *no write
policy at all*, so there was no self-service way to change anything short of the SQL editor).

- `AdBanner` renders a real `BannerAd` once `ads_enabled=true` and a banner ad unit ID is set — mount it
  anywhere; it renders nothing otherwise.
- `showInterstitialAd()` / `showRewardedAd()` load and show real ads, resolving once done.
- `updateAdConfig({ enabled, appId, bannerId, interstitialId, rewardedId })` is what an admin "Ad Settings"
  screen should call — this is the "client turns in an API key" flow. RLS independently re-verifies
  `is_admin`, so this is safe to expose in an admin-only screen without extra server-side plumbing.

**The one asymmetry to design the UI around:** ad unit IDs (`bannerId`/`interstitialId`/`rewardedId`) take
effect immediately, no rebuild. The AdMob **App ID** (`ca-app-pub-XXXX~YYYY` format) does not — it's read by
the native SDK from `app.json`'s `react-native-google-mobile-ads` plugin config
(`androidAppId`/`iosAppId`) at process start, before any JS runs. `app_settings.admob_app_id` exists so an
admin screen can *display/collect* it, but changing that DB value alone does nothing. Also: ad unit IDs only
serve ads when they belong to the same AdMob App ID baked into the build — pasting a client's real ad unit
IDs while the app still ships Google's public sample App ID (currently the case — see `app.json`) will fail
with an App-ID/ad-unit mismatch, not serve test ads. **Going live for real requires exactly one manual step:**
put the client's real AdMob App ID into `app.json`, run `npx expo prebuild --platform android`, and rebuild.
After that one rebuild, ad unit ID changes are runtime-only forever.

**Geo-blocking, now via Cloudflare instead of a third party.** `hooks/useGeoCheck.ts` used to call
`https://ipapi.co/json/` directly from the client — meaning every user's IP address was sent to a company
never disclosed in the privacy policy, just to resolve a country code. It now calls a Cloudflare Worker
(`cloudflare/geo-check-worker/`) that reads `request.cf.country` — Cloudflare already terminates the
connection and already knows this, and Cloudflare is already a disclosed processor for this app (Stream).
The Worker reads `app_settings.geo_block_enabled`/`blocked_countries` on every request (same two rows from
v12, now writable via the admin policy above), so the blocklist is still one source of truth, editable from
an admin screen, with no separate Worker redeploy needed to change which countries are blocked.

**Deploy the Worker:** see `cloudflare/geo-check-worker/index.js`'s header comment — `wrangler login`,
`wrangler secret put SUPABASE_ANON_KEY`, `wrangler deploy`, then put the resulting `*.workers.dev` URL into
`app.json`'s `GEO_CHECK_WORKER_URL` and rebuild. Until that URL is set, `useGeoCheck` fails open (nobody is
blocked) rather than breaking the app.

Currently shipped with `ads_enabled=false` and `geo_block_enabled=false` — both capabilities are live and
ready, nothing is blocking any user or showing any ad until an admin turns them on.

---

## 14. UGC compliance backend (v46–v48) — read this before building new UI

This app was previously terminated by Google Play. Migrations v46, v47, and v48
rebuilt the backend to actually satisfy Play's UGC/payments/moderation
policies, not just document that they should be satisfied. A new front-end
must be built **against this contract** — the RLS/trigger layer enforces all
of it server-side regardless of what the client does, but the UI needs to
guide the user through it or every action will just fail with an opaque RLS
error.

**Terms/guidelines acceptance (v48).** No account can create a channel or
post content until `profiles.terms_accepted_at` is set and
`terms_version`/`community_guidelines_version` match
`current_policy_versions()` in the DB (mirrored client-side as
`POLICY_VERSIONS` in `lib/compliance.ts`). Call `ComplianceService.acceptTerms()`
right after signup (already wired into `app/(auth)/signup.tsx`'s explicit
checkbox — don't rely on a passive "by continuing you agree" sentence, Play
requires an affirmative action). If `POLICY_VERSIONS` is ever bumped, existing
users need a re-acceptance prompt before their next upload attempt, or
`can_create_ugc` will start rejecting them.

**Age gate (v46 + v48).** `profiles.birth_year` is collected at signup and
`can_create_ugc` independently recomputes 18+ server-side — the client-side
check in the signup form is UX only, not the security boundary.

**Reporting & blocking (v46 + v48).** `content_reports` now has `target_type`
('content'/'user'/'copyright'/'other'), and blocking (`user_blocks`) is
enforced *inside* the `channel_posts` SELECT policy, not just filtered
client-side — so even a client that forgets to check blocks won't leak
blocked users' content. Build report/block UI against `ChannelService.reportContent()`
and `BlockService` (`lib/channels.ts`), and an admin moderation queue against
`AdminModerationService` (`lib/compliance.ts`).

**Account status.** `profiles.account_status` ('active'/'suspended'/'banned')
is set by `admin_resolve_report`. A suspended/banned user's content is
excluded from the public feed automatically (RLS), and `can_create_ugc`
blocks them from posting anything new — but nothing currently blocks them
from *logging in*. If the product needs "banned users can't sign in at all,"
that has to be added to the login flow client-side or via a Supabase Auth
hook, since Auth itself doesn't know about `account_status`.

**Entitlements are server-owned (v48, storage model changed in v52).**
`profiles.storage_limit` is no longer a value anyone sets directly — a
trigger recomputes it on every UPDATE. As of v52 it's a flat 15 GB for every
account regardless of `plan_status` — see §17 for the full pivot away from
"Premium = more storage." All other privileged columns (`is_admin`, `plan_status`, `can_upload_content`,
`account_status`, terms fields, `birth_year`) silently revert to their old
value if a non-admin, non-service-role caller tries to change them directly.
**Practical implication for the front-end:** don't build a "my account"
screen that does `supabase.from('profiles').update({...})` with a form that
includes any of those fields — it will silently no-op on those columns. Plan
changes go through `verify-play-receipt` (real purchases) or
`admin_resolve_report`/an admin RPC (support-driven changes), never a direct
client update.

**Storage quota is enforced atomically (v48).** `increment_storage_used`
now raises an error (Postgres code `23514`) instead of silently over-crediting
when a write would exceed `storage_limit` — call it and handle that error
in the upload flow instead of only trusting a client-side percentage check.

**Payments (v46–v50).** UPI + manual screenshot approval was Play's Finding 1
(a Payments policy violation for a digital subscription) — the real fix is
`GooglePlayIapService` (`lib/services/iap.ts`) + `verify-play-receipt`, plus
the v50 additions (purchase acknowledgment, RTDN webhook) — see §15 for the
full rebuild. `app/premium.tsx` now hard-gates the UPI flow behind
`Platform.OS === 'web'`, so it is structurally unreachable on the Android/iOS
build regardless of `IAP_PROVIDER` — this is no longer a "remember to remove
it before shipping" manual step.

**What's still a front-end/content decision, not a backend one:**
privacy policy and terms copy need a final legal identity (company name,
domain, grievance officer) decided by the client, not inferred from either
the old Jollify reference material or the current Cloudlynk placeholder text;
the external account-deletion page's design can be restyled (the deployed
`account-deletion` function is functional, not final visual design); and
whether to keep/remove AdMob and the `ipapi.co` geo-IP call in
`lib/settings.ts`/wherever it's called are product calls, not compliance
requirements by themselves —
though shipping an SDK or a network call that isn't disclosed in Data Safety
*is* a compliance problem, so whichever way that goes, the Data Safety form
has to match. Concretely: `hooks/useGeoCheck.ts` sends the user's IP to
`ipapi.co` (a third party, undisclosed in the current privacy policy) to
resolve a country code, then checks it against `app_settings`'s
`geo_block_enabled`/`blocked_countries` — either disclose that processor and
its purpose, or replace it with a first-party/server-side geo check.

---

## 15. Payments — Google Play Billing (v50)

This is the full payment gateway rebuild — everything needed for Play Billing
to be the *only* way premium is purchased in the Play build, correctly
implemented against the actual installed `react-native-iap@15.3.1` API (an
event-driven, OpenIAP-based library — `requestPurchase` does **not** resolve
with the purchase; results arrive via `purchaseUpdatedListener` /
`purchaseErrorListener`. If this ever needs re-verifying against a newer
version, read `node_modules/react-native-iap/lib/typescript/src/index.d.ts`
directly rather than trusting a doc site, which lagged the shipped API when
this was last checked).

**What v50 fixed that v46–v49 had only scaffolded:**
1. **UPI is now structurally unreachable on Android/iOS**, not just
   "shouldn't be used once configured" — `app/premium.tsx` gates the entire
   UPI/screenshot flow behind `Platform.OS === 'web'`.
2. **The purchase flow itself was calling a method that doesn't exist**
   (`RNIap.requestSubscription(sku)`, a pre-v9 signature) and assumed the
   purchase object came back as a resolved promise. Rewritten in
   `lib/services/iap.ts` to: `fetchProducts({skus, type:'subs'})` for the
   offer token → `requestPurchase({request:{google:{skus, subscriptionOffers}}, type:'subs'})`
   → `purchaseUpdatedListener`/`purchaseErrorListener` (wrapped in a promise
   with a 5-minute timeout) → server verify → `finishTransaction`.
3. **Purchases are now acknowledged.** Google auto-refunds any subscription
   purchase left unacknowledged for 3 days. `verify-play-receipt` acknowledges
   server-side (authoritative) and the client also calls `finishTransaction`
   after a successful verification (belt-and-suspenders — either one
   succeeding is enough).
4. **`iap_purchases` table (new, v50 migration)** records every verified
   purchase: `user_id`, `purchase_token` (unique), `status`, `expires_at`,
   `acknowledged`. This is what makes renewals/cancellations/refunds
   traceable back to a user — Google's webhooks only carry a purchase token,
   never a user id.
5. **`play-rtdn-webhook` (new function)** — Google Play Real-time Developer
   Notifications receiver. Without this, a subscription canceled or refunded
   mid-period keeps `plan_status='active'` until the user happens to trigger
   some other check; Play's Payments policy expects entitlements to track
   the actual purchase state, and Google's own guidance is to listen for
   RTDN rather than poll. On every notification it re-fetches the
   authoritative subscription status from the Play Developer API (doesn't
   try to interpret `notificationType` itself) and updates both
   `iap_purchases` and `profiles.plan_status`/`plan_expires_at`.
6. **Cancellation now behaves correctly.** The original verification logic
   only granted access for `SUBSCRIPTION_STATE_ACTIVE`/`IN_GRACE_PERIOD`,
   which would have cut off a user's access the instant they turned off
   auto-renew — even though they'd already paid for the current period. The
   shared logic (`supabase/functions/_shared/play-billing.ts`) now also
   treats `SUBSCRIPTION_STATE_CANCELED` as valid as long as `expiryTime`
   hasn't passed, matching how "cancel" normally works for any subscription.

**Shared module:** `supabase/functions/_shared/play-billing.ts` holds the
service-account auth, `getSubscriptionStatus()`, and `acknowledgeSubscription()`
— both `verify-play-receipt` and `play-rtdn-webhook` import it, so purchase-time
and webhook-time verification can never drift apart on what "active" means.

**External setup checklist (none of this can be done from code):**
1. Play Console > Monetize > Subscriptions — create ONE subscription product,
   `cloudlynk_premium`, with **four base plans** whose ids exactly match
   `lib/services/iap.ts`'s `DEFAULT_PLANS[].basePlanId`: `silver-7d`,
   `gold-1m`, `platinum-6m`, `diamond-1y`, at ₹199/7d, ₹259/1m, ₹599/6m,
   ₹999/1y. **All four are AUTO-RENEWING** (confirmed by the owner) — the
   auto-renewal disclosure language is already shipped in
   `supabase/functions/legal-pages/terms.ts` §10/§20 and `refund.ts`.
   `verify-play-receipt` derives the granted plan from Google's `basePlanId`
   (not the client's claim — since all plans now share one product id,
   checking the product id alone proves nothing), so the base plan ids must
   match the code exactly. See migration `v53`.
2. Google Cloud Console (same project linked to the Play app) — create a
   service account, grant it "Manage orders and subscriptions" in Play
   Console > Users and permissions, enable the Android Publisher API, and
   run `npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<the full JSON key>'`.
3. Deploy: `npx supabase functions deploy verify-play-receipt` (needs a
   verified session — do NOT use `--no-verify-jwt` here, unlike the other
   functions, since only signed-in app users should call it).
4. Set up RTDN: in Play Console > Monetize > Monetization setup > Real-time
   developer notifications, create/link a Pub/Sub topic. Create a Pub/Sub
   PUSH subscription on that topic pointing at
   `https://wdtwjiixuueqejfraaod.supabase.co/functions/v1/play-rtdn-webhook?secret=<RTDN_SHARED_SECRET>`.
   Then:
   ```
   npx supabase functions deploy play-rtdn-webhook --no-verify-jwt
   npx supabase secrets set RTDN_SHARED_SECRET=<a long random string, matches the URL above>
   npx supabase secrets set GOOGLE_PLAY_PACKAGE_NAME=com.cloudlynk.app
   ```
   Full context in `play-rtdn-webhook/index.ts`'s header comment.
5. Flip `app.json`'s `extra.IAP_PROVIDER` from `"noop"` to `"google_play"`
   once steps 1–3 are done — this is the single switch that makes
   `isIapLive()` select `GooglePlayIapService` over the no-op stub.
   `RECEIPT_VERIFIER_URL` is already set to the function's URL.
6. Before submitting to Play: run a real sandbox purchase on an Internal
   Testing build (a licensed tester account) and confirm `iap_purchases`
   gets a row with `acknowledged=true` and `profiles.plan_status='active'`.

---

## 16. Sign-in: email + password only (Google Sign-In removed in v55)

Cloudlynk has exactly one way in: the email + password form on
`app/(auth)/login.tsx`. There is no OAuth provider and no social sign-in
button. `hooks/useAuth.ts` exposes `signIn` / `signUp` and nothing else;
`signInWithGoogle()` and its `extractRedirectParams()` helper were deleted,
along with `expo-web-browser` / `expo-linking` imports in that file.

`expo-web-browser` stays a dependency — the legal-page launchers
(`app/privacy.tsx`, `terms.tsx`, `community-guidelines.tsx`,
`refund-policy.tsx`, `copyright.tsx`) open hosted pages with it.
`expo-linking` stays too; expo-router depends on it.

`lib/supabase.ts` keeps `flowType: 'pkce'`. It is no longer there for
OAuth — it is the safer default for the auth flows Supabase still routes
through a URL (password recovery, email confirmation), since a captured
link is useless without the verifier the client holds. Do not switch it
back to `implicit`.

**MANUAL STEP — not done by any code change:** switch the Google provider
off in **Supabase Dashboard → Authentication → Providers → Google**.
Until that is done the backend still accepts Google sign-ins even though
the app offers no button for them. Any redirect URLs added for the old
flow (`cloudlynk://auth/callback`) can come out of **Authentication → URL
Configuration → Redirect URLs** at the same time.

### What survived from v51, and why

Migration `20260826120000_v51_google_signin_birth_year.sql` is **not**
reverted. Its one-shot `set_birth_year(int)` RPC (`SECURITY DEFINER`,
rejects under-18 server-side, raises if called twice) is still live and
still used: `birth_year` is one of the columns
`protect_profile_privileged_fields()` blocks from direct client updates,
so the RPC is the only way an existing account can ever supply one.

`app/(auth)/complete-profile.tsx` also stays. It was written for Google
accounts but was never Google-specific: `app/_layout.tsx` routes **any**
session that hasn't accepted the current `POLICY_VERSIONS` there before
letting it into `/(tabs)`, which is what will catch existing users at the
next policy bump. An account that fails the 18+ check there is still
deleted outright via the `delete-account` function.

The v51 migration's own header comment still describes the Google flow.
It is left as written — applied migrations are history, not documentation.

## 17. Premium pivot: content access, not storage (v52)

Cloudlynk's commercial model changed. **Old model:** Premium (any
`plan_status IN ('active','lifetime')`) meant 2TB of storage vs. 15GB free.
**New model, as of v52:** every account — free or Premium — gets the same
flat 15GB of storage. Premium instead unlocks viewing specific content
(movies/series/shorts) that a creator or admin has flagged as premium. This
was a deliberate product decision, not a bug fix — see
`supabase/migrations/20260826140000_v52_premium_content_model.sql` for the
full migration and its reasoning.

**What actually changed:**
- `protect_profile_privileged_fields()` (the v48 trigger that owns
  `storage_limit`) now always sets it to `16106127360` (15GB), full stop —
  no more `plan_status` branch.
- `channel_posts` gained `access_level` (`'free'` | `'premium'`, default
  `'free'`). This is the new monetization flag, separate from
  `content_type` (movie/series/short/post, which is purely editorial
  metadata) and separate from `visibility` (the old `'ad_attributed'`
  column, now dead — no RLS policy reads it anymore, left in place rather
  than dropped since removing columns is a lower-risk-to-defer cleanup).
  `lib/posts.ts` `defaultAccessLevel(contentType)` defaults movies/series to
  premium and shorts/posts to free — matching the pre-v52 de-facto behavior
  — and the upload form (`app/upload/add-content.tsx`) lets the creator
  override it per item with a Free/Premium toggle.
- **This closes a real pre-existing security gap, not just a rename.**
  Before v52, "free users only see shorts in channels they haven't joined"
  was enforced **only in `lib/posts.ts` `getExplorePosts()`'s client-side
  query logic** — RLS itself let any approved post in a public channel
  through regardless of plan_status, so anyone querying `channel_posts`
  directly with the (public, unavoidably-exposed) anon key got premium
  movies/series back for free. The new consolidated RLS policy
  (`channel_posts_select_v52`) enforces `access_level = 'free' OR caller is
  entitled` in the database itself — the only real trust boundary for this
  kind of gate, consistent with how every other entitlement in this project
  (payments, admin, storage quota) is enforced server-side, never client-side.
  `getExplorePosts()` was simplified accordingly — it no longer needs to
  know the viewer's plan or branch its query by it.
- `app/premium.tsx`'s marketing copy, the "you're on Premium" message, and
  the hosted Terms page (`supabase/functions/legal-pages/terms.ts` §3, §10)
  were all rewritten to describe content access rather than storage. The
  benefits list was also trimmed to only what's actually enforced —
  "No Ads" and "priority upload speed" were removed rather than carried
  forward unverified, since nothing in the app currently suppresses ads for
  paid users (no ad is shown anywhere yet) or prioritizes uploads. Re-add
  either only alongside the code that actually does it.
- Nothing about *how a purchase is verified* changed — `verify-play-receipt`,
  `play-rtdn-webhook`, and the `subscription_plans` rows/product-ID mapping
  (§15) are untouched. `plan_status='active'` is still the single signal
  that flows from a verified Play purchase into an entitlement; only what
  that entitlement *grants* changed.

**What this does NOT do, and would need follow-up work:**
- There's no "teaser" mode — a premium post is either fully visible (title,
  thumbnail, video — everything) or entirely invisible to a non-entitled
  viewer, matching the existing (v28) precedent for gated content in this
  codebase. A Netflix-style "see the poster, need Premium to play" UX would
  need a new mechanism (e.g. an edge function returning stripped-down
  metadata for locked posts) — not built here; flag if the product wants it.
- Premium video playback is now locked down (v54). A premium post's Stream
  video has `requireSignedURLs=true` set on Cloudflare, so its plain
  `videodelivery.net` URL 403s for everyone. The `stream-playback-token` edge
  function is the only way to get a playable URL: it re-derives entitlement
  server-side (RLS-gated `channel_posts` read under the caller's own token +
  an explicit `plan_status` check) and mints a ~6h Cloudflare token only for
  an active/lifetime subscriber. `lib/stream.ts` `getHlsPlaybackUrl` is now
  free-content-only; premium goes through `getSignedPlaybackUrl(postId)`.
  **Real limitation (inherent to every signed-URL video service, not a gap
  this introduced):** a ~6h signed URL, once minted for a legitimate Premium
  viewer, keeps playing for anyone who obtains *that exact URL* until it
  expires. What this fully prevents: a Free or logged-out user minting their
  own valid URL. What it does not prevent: a Premium user deliberately
  sharing their fresh link, or screen recording. Binding tokens to a
  device/IP would narrow the first case but breaks users who change networks
  mid-video — deliberately not done.
- If a post's `access_level` is later changed premium→free, its Cloudflare
  `requireSignedURLs` flag stays `true` (treated as one-way in practice for
  already-uploaded videos). Harmless in the current UI — the client only
  calls `getSignedPlaybackUrl` when `access_level==='premium'`, and any
  entitled user can still get a token — but a post flipped back to free
  would no longer play for a Free viewer via the plain path. Flip it back on
  Cloudflare manually (POST the video with `requireSignedURLs:false`) if that
  case ever matters.
- Pre-v52 rows: existing `movie`/`series` posts were backfilled to
  `access_level='premium'` (matching the old de-facto rule); everything
  else defaulted to `'free'`. If a creator wants a specific past movie made
  free (or a short made premium), that's a manual `UPDATE` today — no admin
  UI toggle exists for changing an existing post's access level after
  upload (only at upload time).

---

## §18 — Second audit response (2026-08-26): native build blocker, secrets, gate verification

A friend's AI produced a ZIP audit plus a 36-gate "release plan." Both were
independently re-checked claim-by-claim against this repo rather than
accepted at face value. Findings:

**Fixed this pass:**
- `android/app/build.gradle`, `settings.gradle`, `strings.xml`: native
  identity was still `com.streamly.cloud`/"Streamly" despite `app.json`
  saying `com.cloudlynk.app`/"Cloudlynk" — text now matches.
- `AndroidManifest.xml`: deep-link scheme was still `streamly`/`exp+streamly`
  (would have silently broken the Google Sign-In callback), plus 4 legacy
  storage/media permissions left over from before the `app.json` cleanup.
  Fixed. Two of these permissions were also still listed in `app.json` —
  removed there too.
- `.env` had been included in every handoff ZIP sent throughout this
  engagement (the zip-build command didn't respect `.gitignore`). **If you
  are reading this and haven't rotated `SUPABASE_SECRET_KEY`,
  `CLOUDFLARE_R2_ACCESS_KEY_ID`/`_SECRET_ACCESS_KEY`, and
  `CLOUDFLARE_STREAM_API_TOKEN` yet, do that before anything else below.**
- `scripts/package.json` + both lockfiles: `streamly`/`streamly-scripts` →
  `cloudlynk`/`cloudlynk-scripts` (npm package names, cosmetic but cheap).
- Legacy docs (12 files under `docs/`, 8 at repo root, including a stale
  `TEST_PLAN.md` describing a defunct 30-minute-paywall pricing model)
  archived into `docs/archive/` with a README explaining why they're not
  current. `README.md` and `BUILD.md` rewritten in place.
- Added `supabase/tests/premium_rls_matrix_test.sql` — a runnable
  self-test (impersonates `authenticated` role + each test user's JWT
  `sub`, the same way PostgREST does) that mechanically verifies the
  free/premium/public/private/pending/suspended access matrix against the
  real `channel_posts_select_v52` policy, and that an expired plan does
  NOT touch `storage_limit`. Run it in the Supabase SQL editor before
  trusting the policy in production; it cleans up after itself via
  `ROLLBACK`.

**Verified already correct, no change needed (the audit either didn't
check these or got them right without me having to act):**
- UPI payment flow (`app/premium.tsx`) is gated behind
  `Platform.OS !== 'web'` — completely unreachable on Android/iOS builds,
  so it can't become an alternate-billing policy violation on Play.
- AdMob: `ADMOB_ENABLED` in `app.json` is dead/unused; the real gate is a
  DB-backed `app_settings.ads_enabled` flag (`lib/adsConfig.ts`) that
  defaults false, and no code calls `mobileAds().initialize()` — Google's
  sample test App ID sitting in the manifest is inert until an admin turns
  ads on with real IDs, which itself requires one native rebuild first.
- Account deletion (`supabase/functions/delete-account`,
  `account-deletion`) already cleans 4 storage buckets, deletes Cloudflare
  Stream UIDs (with reference-counting so a still-shared UID isn't
  deleted out from under someone else), removes the FCM/push token via the
  `profiles` row delete, and relies on `ON DELETE CASCADE` from
  `channels`/`channel_posts`/`channel_members`/`user_blocks` back to
  `profiles` — verified against `schema.sql`'s actual FK definitions, not
  assumed. Both an in-app path and a no-install-required external web page
  exist, satisfying Play's account-deletion requirement.
- Premium expiry cannot zero out storage or touch files:
  `protect_profile_privileged_fields()` (v52) sets `storage_limit` to a
  flat 15GB unconditionally, with no `plan_status` branch left in it at
  all — confirmed by reading the trigger, not just by the migration's own
  comment.
- The audit's "no premium-content upload UX" finding was checked against
  the wrong file (`app/create-content.tsx`, the channel-creation screen).
  The real per-post upload screen, `app/upload/add-content.tsx`, has had
  the free/premium `accessLevel` toggle since the v52 pivot.

**Confirmed still open, and genuinely require the user's own accounts/
hardware/decisions — not fixable from a sandbox with no Node/Android SDK
and no access to the user's Supabase/Cloudflare/Play/EAS dashboards:**
running `expo prebuild --platform android --clean` (the `android/` folder
has zero Kotlin/Java source files and cannot compile as-is); EAS project
ownership (`southern-methodist-university` → the real account); Play
Console product/service-account/RTDN setup and flipping `IAP_PROVIDER` to
`google_play` only after that's live and tested;
legal identity/jurisdiction placeholders; Google Cloud OAuth + Supabase
provider configuration for Google Sign-In; and everything that requires a
physical device or a real Play Console listing (API 36 confirmation, the
actual purchase/entitlement/refund flow, Data Safety, Play internal
testing).

---

**Last updated:** 2026-08-26 (v46–v52: UGC moderation, terms acceptance,
entitlement security, real Play Billing implementation + purchase
acknowledgment + RTDN webhook, external account deletion,
admin-configurable ads, Cloudflare-based geo-blocking, hosted legal pages,
admin moderation queue UI, report-user flow, real Google Sign-In, premium
pivot from storage to content access, second-audit response + native build
blocker + secrets sweep + RLS self-test)
## 19. Pre-purchase approval gate (v55)

`profiles.approval_status` (`'pending' | 'approved' | 'rejected'`, plus
`approval_reviewed_by` / `approval_reviewed_at` / `approval_note`) records
whether an admin has vetted an account. Migration:
`supabase/migrations/20260905120000_v55_user_approval_gate.sql`.

**This is a PRE-purchase gate and only that.** An unapproved account never
reaches the subscribe flow — `app/premium.tsx` renders a calm "your account
is being reviewed" state instead of the plan list. Nothing else is gated:
an unapproved account signs in normally, lands on `/(tabs)`, browses,
watches free content and uses cloud storage exactly like anyone else, and
premium posts stay locked for it precisely as they already are for any
non-subscriber. There is deliberately **no** approval check in
`app/_layout.tsx`'s redirect logic and no blocking interstitial.

**The hard rule: if money changed hands, the entitlement is granted.**
`supabase/functions/verify-play-receipt/index.ts` and
`play-rtdn-webhook/index.ts` do not read `approval_status` and must never
start. If an unapproved account somehow completes a real purchase
(modified client, a race with a rejection, a restore of an older
purchase), the plan is granted exactly as it would be for an approved one.
`app/premium.tsx` enforces the same ordering client-side: the
already-subscribed branch is checked *before* the approval branch, so a
paying account always sees its entitlement. Withholding a paid entitlement
pending an admin click is the pattern that got this app removed from Play
once already (`docs/PLAY_STORE_COMPLIANCE_AUDIT.md` Finding 1) — that is
the whole reason the gate sits before the purchase rather than after it.

**Backfill.** The column is created with `DEFAULT 'approved'` and only then
switched to `DEFAULT 'pending'`, so every account existing at migration
time is approved and `'pending'` applies to signups from that point on.
Doing it that way (rather than an `UPDATE` after the fact) keeps the
migration re-runnable — a second run cannot silently approve accounts that
are legitimately awaiting review. Admins are separately forced to
`'approved'` on every run.

**Self-approval is blocked.** All four columns are in the revert list
inside `protect_profile_privileged_fields()`, re-declared in full in v55
from its current v52 form. A user's own
`from('profiles').update({approval_status:'approved'})` is silently
reverted by the trigger, exactly like `is_admin` or `plan_status`.

**RPCs** (both `SECURITY DEFINER`, both re-verify `is_admin` themselves):

- `admin_set_user_approval(p_user_id uuid, p_status text, p_note text)` —
  validates status against `('approved','rejected')`, stamps
  `approval_reviewed_by`/`_at`, sets `app.trusted_update` so its own write
  clears the trigger. Follows `admin_resolve_report` (v48) exactly. It
  deliberately never touches `plan_status`.
- `admin_list_user_approvals(p_status text, p_limit int)` — the queue
  reader. Needed because `profiles` has **no admin-wide SELECT policy**:
  the only SELECT policy on the table is `auth.uid() = id`, so an admin
  querying other people's rows gets an empty result rather than an error.
  A narrow `SECURITY DEFINER` reader returning only the eight columns the
  screen shows was preferred over a blanket "admins read all profiles"
  policy. `public.is_user_approved(uuid)` is the read-side helper for the
  gate itself.

  ⚠️ **Pre-existing, untouched:** the same missing policy is why
  `app/admin/reports.tsx`'s reporter / reported-user name enrichment
  (a direct `from('profiles').select(...).in('id', ...)`) shows
  "Unknown" for everyone but the admin themselves. Worth a separate fix.

**UI.** `app/admin/user-approvals.tsx`, linked from the admin block in
`app/(tabs)/profile.tsx` alongside the other admin subscreens. Pending
first, with Approved / Rejected filters; rejection requires a note. Its
`isAdmin` check is UX only — the RPCs are the security boundary.

---

**Maintainer:** user-driven Claude sessions
**Next milestones:** rotate exposed Supabase/Cloudflare secrets, run `expo prebuild --platform android --clean` on a real machine and re-verify identity/permissions survived it, replace placeholders in `legal-pages` with real legal identity, deploy `legal-pages`/`account-deletion`/`verify-play-receipt`/`play-rtdn-webhook` functions + the Cloudflare Worker, front-end rebuild against this backend contract (see §14), Play Console service-account + product setup + RTDN Pub/Sub wiring (see §15), switch the Google auth provider OFF in the Supabase dashboard now that Google Sign-In is removed (see §16), decide whether to build a "teaser" mode and/or signed Stream URLs for premium content (see §17), real AdMob App ID + one native rebuild, EAS project ownership transfer, Play Store resubmission
