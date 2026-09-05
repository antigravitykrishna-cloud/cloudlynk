# Streamly v0.7.1 — Scalability design notes

Date: 2026-08-03
Author: Mavis (pre-implementation design notes for the user/Claude to act on)
Branch under design: `launch-hardening` (pre-merge)
Target branch for implementation: a new `v0.7.1` branch cut after `launch-hardening` merges to `main`

**This is not a code doc — it's the design thinking that should drive v0.7.1 work.** It captures the scaling concerns, the trade-offs, and the design decisions that need to be made before implementation starts. Each section has: (a) the v0.7.0 state, (b) the failure mode at scale, (c) the v0.7.1 design proposal, (d) the open questions.

**Target scale for v0.7.1:** 1k DAU, 10k MAU, 100k total videos, 1TB of Cloudflare Stream storage, ~50k watch-history rows/day. (This is a 10× bump from the v0.7.0 internal-testing load, so the design must hold for that envelope — not for 1M DAU. Beyond 100k DAU is a v0.8 / v1.0 problem and gets a different design.)

---

## 1. Subscription flow → Google Play Billing

### 1.1 v0.7.0 state

Manual UPI flow:
1. User taps plan → opens UPI app via `upi://` deep link.
2. User pays, screenshots confirmation, uploads it to `payment-screenshots` bucket.
3. Admin opens `app/admin/subscription-requests.tsx`, reviews the screenshot, taps Approve.
4. `approve_subscription_request` RPC flips `profiles.plan_status = 'active'`.

This is great for trust (no automated failure modes), terrible for scale. At 100 paying users, the admin becomes a bottleneck. At 1k paying users, the admin is the entire bottleneck — every signup waits for a human.

### 1.2 Failure mode at scale

- **Admin review queue grows linearly with paying users.** No prioritization, no SLA, no on-call.
- **No auto-renewal.** Every subscription is one-and-done — the user has to manually re-pay at the end of the period.
- **No refunds.** If the user was wrongly charged, there's no self-serve path.
- **7-year payment retention** in the privacy policy becomes a tax on storage at scale (1k users × 1 payment/yr × 7 years × 1 screenshot = 7k screenshots, ~700MB. Manageable. At 100k users it's 70k screenshots / 7GB, still fine. But it shows the policy is operationally meaningful.)
- **No tax invoice.** India's GST rules require a tax invoice for any B2C digital service. The current UPI flow has no invoice generation, no GSTIN on the receipt, no compliance trail. This is a **legal risk**, not just a UX gap.

### 1.3 v0.7.1 design

**Two-track strategy:** keep UPI as a backup path (some users in India genuinely prefer UPI over cards), add Google Play Billing as the primary path for auto-renewal.

#### Track A: Google Play Billing (primary)

- **Backend:** use RevenueCat (`https://www.revenuecat.com/`) as the abstraction layer. Reasons: handles the server-side receipt validation, the webhook to our backend, the entitlement state machine, the cross-platform fallback. Build-it-yourself Play Billing server-side is a 2-week rabbit hole that distracts from product work; RevenueCat's free tier covers up to $2.5k MTR (monthly tracked revenue) which is well past v0.7.1's expected revenue.
- **Client:** `react-native-iap` is already in the `app.json` plugins (added for v0.7.0's planned-IAP future but unused so far). Hook it up to RevenueCat's SDK wrapper.
- **Data model:** new `play_subscriptions` table (separate from `subscription_requests` — different lifecycle):
  - `id` (UUID)
  - `user_id` (FK auth.users)
  - `revenuecat_entitlement_id` (text)
  - `product_id` (text — e.g. `streamly_premium_monthly`)
  - `status` ('active' | 'expired' | 'cancelled' | 'grace_period' | 'billing_retry')
  - `started_at`, `expires_at`, `cancelled_at`, `renewed_at` (timestamps)
  - `original_purchase_date`, `is_trial_conversion` (booleans, from RevenueCat webhook payload)
- **State machine:** the `play_subscriptions.status` is the source of truth. `profiles.plan_status` becomes a derived column updated by a trigger on `play_subscriptions` (avoids drift between the two).
- **Plan mapping:**
  - Google Play product `streamly_premium_monthly` → `subscription_plans.plan_code = 'monthly_play'`
  - `streamly_premium_yearly` → `plan_code = 'yearly_play'`
  - UPI-only plans stay in `subscription_plans` with their current `plan_code` ('monthly', 'yearly')
  - On the user-facing `my-subscription` page, plans are shown grouped by payment method.
- **Migration:** when a user has both a UPI `subscription_requests` row and a Play `play_subscriptions` row active, Play takes precedence (auto-renewal > manual). When the Play sub expires, fall back to UPI sub if active, else 'free'.
- **Compliance:** RevenueCat can issue India GST-compliant invoices. Confirm before launch — this is a blocker for v0.7.1 launch in India if not solved.
- **Test mode:** Play Console has `License testers` for sandbox purchases. Add the user's tester account to that list before the build goes to internal testing.

#### Track B: UPI (kept as backup)

- Keep the current flow as-is. The UPI sub model is "one and done" — user pays once for a fixed period. No auto-renewal.
- Add an explicit renewal reminder: 3 days before `plan_expires_at`, the user gets an in-app banner "Your plan expires in 3 days — renew now to keep premium features".
- Add the missing `rejection_reason` notification — if admin rejects a request, show the user the reason in `my-subscription` (currently the rejection reason is stored but not surfaced).
- Add a `payment_attempts` count to `subscription_requests` so we can detect users who retry-payment frequently (a fraud signal).

### 1.4 Open questions

- **Pricing parity:** Google Play takes 15% (30% the first year, then 15% after $1M in revenue per the Play Store small-business program). Do we pass this fee to the user (price Play sub at ₹299 vs UPI at ₹250), or absorb it (price both at ₹250, eat the fee)? This is a finance decision, not a technical one.
- **UPI subs + Play subs stacking:** can a user have both at once? The current design says "Play takes precedence", but the UX of "you have two active subs" is confusing. Likely answer: prevent dual subs at the client (button disabled if either is active), but allow the transition (Play sub starts while UPI sub is still active — wait for UPI to expire, then Play is the only one).
- **Refund flow:** Play handles refunds server-side; we just need to handle the webhook. UPI refunds are manual (we Venmo the user back, then mark the request as refunded). Track this in v0.7.1 as a small additional feature, not a v0.7.0 launch blocker.

---

## 2. Plan expiry cron

### 2.1 v0.7.0 state

`profiles.plan_expires_at` is set on approval but nothing flips `plan_status` to 'expired' when the time passes. A user who paid for 30 days on day 1 is still 'active' on day 31.

### 2.2 Failure mode at scale

- Free trial abuse: a user could pay for 1 day, get 'active', and stay 'active' forever (just no auto-renewal, but no auto-expiry either).
- Revenue leakage: users who should be expired are still consuming Premium features.

### 2.3 v0.7.1 design

- **Supabase pg_cron** scheduled function: daily at 00:00 UTC, `UPDATE profiles SET plan_status = 'expired' WHERE plan_status = 'active' AND plan_expires_at < now()`.
- **Idempotent:** safe to re-run, no side effects on already-expired rows.
- **For Play subs:** the trigger is the `play_subscriptions.expires_at` (driven by RevenueCat webhook), not a cron. The cron only handles UPI subs.
- **Logging:** write to a `plan_expiry_log` table (audit trail, lightweight) — `user_id`, `expired_at`, `previous_plan_code`, `triggered_by` ('cron' | 'play_webhook').
- **User notification:** when the cron expires a user, the next time they open the app, the Explore page's premium check fails, and the `my-subscription` page shows "Your plan expired on [date]. Renew to keep premium features." Push notifications are out of scope for v0.7.1 (see §4).

### 2.4 Open questions

- **Time zone:** `plan_expires_at` is stored as `timestamptz` (good). Cron runs at 00:00 UTC. The "expired" cutoff is the exact `plan_expires_at` instant, not "midnight on the day after". Verify this matches user expectation ("I paid until 5pm, so 5:01pm is when it expires, not midnight").
- **Grace period:** should we give 24h grace after expiry before flipping? Trade-off: better UX vs. revenue leakage. Default to 0h grace for v0.7.1, revisit if complaints.

---

## 3. Background upload survival

### 3.1 v0.7.0 state

Uploads go through `lib/uploadQueue.persistence.ts` → `lib/services/cloudflareStream.ts` (or similar) — uses an `AbortController` and a `fetch` with the Supabase client. The JS context holds the in-flight request. If Android backgrounds the app and kills the JS process, the upload is lost (the partial upload in Cloudflare Stream stays as an "abandoned" UID and we have to garbage-collect it later).

### 3.2 Failure mode at scale

- A 500MB video takes 5+ minutes on slow 4G. The user backgrounds the app. The OS kills the JS context. The upload restarts from 0% on next foreground.
- Multiple abandoned uploads accumulate in Cloudflare Stream. We pay for storage of bytes we'll never reference.

### 3.3 v0.7.1 design

- **Foreground service** (Android): `notifee` or `expo-task-manager` + a `ForegroundService` that holds the JS context alive during uploads. Shows a persistent notification "Uploading 3 of 5 videos" so the user knows the work is happening.
- **TUS protocol** (resumable uploads): Cloudflare Stream supports TUS. Replace the current `fetch` upload with `tus-js-client` or `uppy`. Resumable, with offset-based resumption — a 500MB upload that died at 60% can resume from 60% instead of restarting.
- **Server-side cleanup:** add a pg_cron daily job that calls Cloudflare Stream's "list unconverted" + "delete abandoned" API for any UID older than 24h with no corresponding `channel_posts` row.
- **Client-side retry policy:** exponential backoff with jitter (1s, 2s, 4s, 8s, give up at 5 tries). Surface a clear "upload failed after 5 tries" message with a manual retry button.

### 3.4 Open questions

- **Foreground service battery cost:** holding a JS context alive drains the battery. Test on a low-end device (Moto G series). If the drain is unacceptable, fall back to "TUS without foreground service" — the upload is still resumable, but if the OS kills the JS context, the resume happens on next foreground.
- **iOS support:** v0.7.0 is Android-only. When iOS lands, the same code path works (NSURLSession background sessions are the iOS equivalent of TUS). For v0.7.1, ignore iOS.

---

## 4. Push notifications (admin alerts)

### 4.1 v0.7.0 state

No push notifications. Admin has to open the app and check the subscription requests list. New users who paid and are waiting for approval don't know what's happening.

### 4.2 Failure mode at scale

- Admin misses a request for 24h → user churn ("I paid, nothing happened, I uninstalled").
- User churn rate correlates with admin responsiveness.

### 4.3 v0.7.1 design

- **Expo Push** (single Expo project, both platforms when iOS lands). The Expo Push service is free up to 1k push notifications per month, scales linearly after that with a pay-per-use plan.
- **Token registration:** on first launch (or first sign-in), register a push token in `expo_push_tokens` table (new). RLS: own-row insert/delete, admin select-all.
- **Triggers:**
  - New `subscription_requests` row → push to all admins. Title: "New subscription request", body: "<user_email> paid ₹<amount> for <plan>".
  - `subscription_requests.status` flips to 'rejected' → push to that user. Title: "Plan request rejected", body: "Reason: <rejection_reason>".
  - 3 days before `plan_expires_at` → push to the user. Title: "Your plan expires soon", body: "Renew to keep premium features."
  - `plan_status` flips to 'expired' → push to the user. Title: "Your plan expired", body: "Renew to keep premium features."
- **Delivery:** Expo Push → APNs (iOS, future) / FCM (Android). On Android, requires `google-services.json` + Firebase config — note this adds a **third-party SDK** (Google's FCM), which means the Play Store Data Safety form needs to be re-submitted for v0.7.1.
- **Admin opt-out:** admins can opt out of subscription-request pushes from the admin settings page. Default is "on".

### 4.4 Open questions

- **User-side opt-in:** Android 13+ requires the user to grant `POST_NOTIFICATIONS` permission at runtime. Request it contextually — "We'll notify you about plan expiry" — not as a blanket prompt on first launch.
- **Play Store Data Safety:** adding FCM means Google now sees push token + device ID. Update `docs/play-store-data-safety.md` before v0.7.1 ships. This is a 1-line addition to "Device or other IDs".

---

## 5. Observability

### 5.1 v0.7.0 state

- No Sentry, no Firebase Crashlytics, no logging aggregation.
- Console logs gated behind `__DEV__` (release builds print nothing).
- Server logs are Supabase function logs (visible in dashboard, 7-day retention).
- Errors are caught in client code but most just become silent failures or user-facing toasts.

### 5.2 Failure mode at scale

- "The app is broken for some users" → no way to find out which users, no way to reproduce, no stack traces.
- "The admin queue has 50 pending requests but 0 are approving" → no metrics on approval latency.
- "Cloudflare Stream bills spiked" → no correlation to traffic patterns in our DB.

### 5.3 v0.7.1 design

- **Sentry** (mobile + server):
  - Client: `@sentry/react-native`, init in `app/_layout.tsx`, capture exceptions + breadcrumbs (network calls, navigation, user actions).
  - Server: Sentry DSN configured for Supabase edge functions.
  - Cost: free tier is 5k events/month; almost certainly enough for v0.7.1 scale. When we outgrow it, the Developer tier is $26/mo.
  - **PII filtering:** configure `beforeSend` to scrub emails, UPI TRX IDs, screenshot paths. Don't capture the `console.log` of the actual subscription request payload.
- **Metrics dashboard** (Grafana Cloud free tier, or just a Postgres-driven Metabase):
  - Daily active users (DAU)
  - New signups
  - Subscription conversion rate (free → paid)
  - Subscription approval latency (admin responds in <1h? <24h?)
  - Upload success rate
  - Player errors (categorized: HLS manifest fetch fail, ExoPlayer exception, OutOfMemory, etc.)
  - Free → Premium funnel
- **Synthetic monitoring** (1 cron job):
  - Hourly ping to `app/(tabs)/explore.tsx` via headless Playwright — if the page returns 5xx, alert. (Doesn't apply to the native app directly, but the explore endpoint it hits is server-side.)
  - This is overkill for v0.7.1. Defer.

### 5.4 Open questions

- **Is Sentry worth the SDK weight?** `@sentry/react-native` adds ~5MB to the APK. If we never look at the dashboard, it's pure cost. v0.7.1: add it, but only if there's a person on the team who'll actually look at the alerts. Otherwise defer to v0.7.2.
- **User consent for crash reports:** Sentry's payload can include user context. Configure it to NOT include the user's email or any PII. The user shouldn't be identifiable from a Sentry event.

---

## 6. RLS performance

### 6.1 v0.7.0 state

RLS is enabled on every user-data table. Most policies are simple (`auth.uid() = user_id`) which the query planner can optimize. A few use `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)` for admin checks.

### 6.2 Failure mode at scale

- At 100k rows in `watch_history`, the `EXISTS` check on `profiles` per row could become the bottleneck if a user has 100k+ watch history rows and we're joining for an admin query. (Unlikely, but possible if a user is a power-consumer and an admin is querying all watch history.)
- `subscription_requests` admin policy does a join — if the admin's subscription-requests page does pagination with offset, the policy runs once per page (so once per 50 rows). Cheap, but worth a benchmark.

### 6.3 v0.7.1 design

- **Benchmark** the v0.7.0 RLS policies at 10×, 100× expected data volume. Specifically:
  - `subscription_requests` admin list (page of 50)
  - `channel_posts` public read (cold-cache vs warm)
  - `watch_history` own-row insert (most common write path)
  - `files` public-channel-file read (most common read path)
- **Index audit:** every WHERE clause in an RLS policy needs a matching index. v0.7.0 already has most of them, but a `EXPLAIN ANALYZE` on the production query plans will show any missing ones.
- **Admin-bypass shortcut:** consider a `SECURITY DEFINER` function for admin-only reads (e.g. `admin_list_subscription_requests()`) that runs with the definer's permissions, bypassing RLS. Faster than per-row EXISTS check, but also more dangerous (one bug in the function = data leak). v0.7.1: only do this if benchmarks show the policy is the bottleneck, not preemptively.

### 6.4 Open questions

- **Connection pooling:** Supabase has a connection pooler (PgBouncer). At 1k DAU with React Native, each user session can hold 1-2 connections. The free tier allows 60 direct connections; we'd hit that with ~30 concurrent users. v0.7.1 should use the pooler in the server-side functions and rely on the connection limit for clients. Check the Supabase dashboard for current connection counts.

---

## 7. Storage cost

### 7.1 v0.7.0 state

- `channel-media` bucket: public, holds thumbnails + channel art. Size cap is the Supabase project default (probably 1GB free, then pay-as-you-go).
- `payment-screenshots` bucket: private, 1 screenshot per subscription request. 7-year retention.
- Cloudflare Stream: holds the video bytes. 1000 videos × 500MB = 500GB = $5/mo on the Stream Bundle plan.

### 7.2 Failure mode at scale

- 100k videos × 500MB = 50TB. At Stream's per-minute-of-storage pricing, this is ~$500/mo. Reasonable.
- 100k subscription requests × 1 screenshot × 200KB = 20GB. At Supabase storage pricing, ~$2.50/mo. Fine.
- **Abandoned uploads** (per §3): if not cleaned up, this is the real cost driver. 1000 abandoned × 500MB = 500GB = $5/mo. Not catastrophic, but adds up.

### 7.3 v0.7.1 design

- **Storage cap per user:** v0.7.0 has a soft cap (5 free uploads in queue, no storage cap on committed uploads). v0.7.1 should add a hard cap:
  - Free: 2GB total
  - Premium: 50GB total
  - Implement as a `profiles.storage_used_bytes` counter (already exists in v0.7.0) + a check in the `generate-stream-upload` edge function.
- **Lifecycle policy on payment-screenshots:** after 7 years, the policy says we can delete. Set up a pg_cron + Storage API call to delete the screenshots (the `subscription_requests` row stays, the binary goes).
- **Cloudflare Stream lifecycle:** set Stream's `maxDurationSeconds` to 7200 (2 hours, the hard cap on a single video). Anything over is rejected at upload time.

### 7.4 Open questions

- **DRM:** if a creator wants their content to be hard to pirate, Cloudflare Stream supports signed URLs with expiry. v0.7.0 uses public HLS URLs (anyone with the UID can watch). v0.7.1: per-creator signed URLs with 1-hour expiry, opt-in (premium feature?). This is a privacy-policy change (data sharing is still "no", but access control is stricter) — update the policy.

---

## 8. Testing infrastructure

### 8.1 v0.7.0 state

- No automated tests. Manual smoke tests on the user's device.
- `docs/player-test-matrix-v0.7.0.md` is a manual matrix.

### 8.2 Failure mode at scale

- Regressions slip through. The user has to do a full manual test pass before every release.
- "It worked on my phone" is the only confidence level we have.

### 8.3 v0.7.1 design

- **Unit tests** (Jest, already in Expo's default template):
  - `lib/iapHelpers.ts` — the UPI URL builder. Trivial to test. v0.7.1: hit 100% coverage on this file.
  - `lib/services/playerPrefs.ts` — round-trip get/upsert. Mock AsyncStorage.
  - `lib/uploadQueue.persistence.ts` — the queue state machine. Edge cases (queue full, retry exhausted, app backgrounded mid-upload).
- **Integration tests** (Detox for the native flow, or Playwright for the web admin):
  - Detox is the standard for RN. v0.7.1 setup: install Detox, write 5 smoke tests (sign in, browse explore, open player, subscribe, log out). Run on EAS Build's CI.
  - Playwright for the (future) web admin. v0.7.1: not needed (no web admin yet).
- **Visual regression** (optional): Percy or Chromatic. Not needed for v0.7.1; revisit if design becomes a moving target.
- **CI/CD** (EAS Build already does the build):
  - Add `eas build --auto-submit` to the merge-to-main flow.
  - Add Jest to the PR-check flow (`npx jest` before merge).
  - Add Detox to the nightly-build flow (full E2E on a real Android device).

### 8.4 Open questions

- **Detox vs Maestro:** Detox is more mature but more setup. Maestro is newer, simpler (YAML-based), and works for both iOS and Android. v0.7.1 recommendation: Maestro for the simple cases, Detox if we need deep native control.

---

## 9. Architectural decisions to make in v0.7.1

These are the cross-cutting decisions that need to be made before any single feature lands. Get these wrong and the rest of v0.7.1 has to work around them.

### 9.1 Single source of truth for "is this user premium?"

**v0.7.0:** `profiles.plan_status = 'active'`. Derived from `subscription_requests` admin approval.

**v0.7.1 candidates:**
- (a) Keep `profiles.plan_status` as the cached value, updated by triggers from `subscription_requests` (UPI) and `play_subscriptions` (Play). Simple, but triggers are easy to get wrong.
- (b) Replace with a `current_entitlement` view that joins both tables. No mutation, no cache invalidation, but every premium check is a SQL query.
- (c) Move it to a separate `entitlements` table that's a snapshot, refreshed by a trigger or cron. Most explicit, most complex.

**Recommendation:** (b) for v0.7.1, with a 30-second in-memory cache on the client to avoid hammering the DB. Triggers (option a) are too easy to break; views are SQL-native and the planner can optimize them.

### 9.2 Player state — local-first or server-first?

**v0.7.0:** `watch_history` is server-side. The client writes the last position to the server on every `timeUpdate` (with debounce). The server is the source of truth for "where did the user stop watching".

**v0.7.1 candidates:**
- (a) Keep server-first. Every watch progress is a server write. Robust to multi-device but expensive at scale.
- (b) Local-first, sync on app close. `AsyncStorage` is the source of truth for the current session; the server gets the final position on app close or every 30s. Cheap, but the server loses real-time progress.
- (c) Hybrid: local-first for the active session, server sync every 30s + on close. Best of both, more code.

**Recommendation:** (c) for v0.7.1. The 30s sync handles multi-device "I switched from phone to tablet" cases; the local-first part keeps the server load low.

### 9.3 Episode navigation ordering

**v0.7.0:** Episode order is whatever order the `channel_posts` query returns. If episodes are added out of order, the player shows them in creation order (FIFO), not narrative order.

**v0.7.1 candidates:**
- (a) Add an `episode_number` column to `channel_posts` (or to a `series_episodes` join table). Creator sets it manually.
- (b) Auto-derive from upload time, with manual override.
- (c) Drag-and-drop reorder in the channel admin UI.

**Recommendation:** (b) for v0.7.1, with (c) on the wishlist. (a) requires every creator to renumber their series on every upload — too much friction.

### 9.4 Subtitle rendering

**v0.7.0:** `subtitles` table exists (v42 migration) but the player doesn't render them. Creators can upload VTT files via... actually, there's no UI for this in v0.7.0. The table is dead schema.

**v0.7.1 design:**
- Creator UI: a "Subtitles" tab on each video's edit page. Upload a VTT file. Server stores it in the `subtitles` table with the `post_id` and language code.
- Player rendering: `expo-video` doesn't expose native subtitle rendering in 6.x. Options:
  - Custom overlay: parse VTT in JS, render text on a `<View>` at the bottom. Hacky but works.
  - Upgrade to a player that supports subtitles natively (e.g. `react-native-video` v6, which we tried and it has media3 conflicts). Revisit when expo-video's subtitle API stabilizes.
- For v0.7.1: ship the creator UI (low effort) but defer the player rendering to v0.7.2 (high effort, low initial demand).

### 9.5 Multi-region

**v0.7.0:** India-only. UPI is India-only. No i18n. No multi-currency.

**v0.7.1 candidates:**
- (a) Stay India-only. Defer international to v0.8.
- (b) Add Stripe + multi-currency in v0.7.1. Big lift, but opens the EU/US market.
- (c) i18n the app strings (en-IN / hi-IN) but keep payments India-only.

**Recommendation:** (c) for v0.7.1, (b) for v0.8. (a) is fine but misses the i18n win — most Indian users prefer Hindi UI even if they can read English.

---

## 10. The "what we are NOT doing in v0.7.1" list

To keep scope from sprawling, the following are **explicitly out of scope** for v0.7.1:

- iOS app (Android-first; revisit when revenue justifies the build pipeline cost).
- Web app / web admin (no demand yet).
- Real-time chat / DMs (not in v0.7.0; not in v0.7.1).
- AI features (recommendations, auto-captions, content moderation). DPDPA consent is a prerequisite; v0.8.
- DRM / signed URLs (creator demand is low at v0.7.1 scale; v0.8).
- Federated / ActivityPub integration (deferred to a v1.x).
- Multi-region / multi-currency (v0.8).
- Encrypted at rest beyond what Supabase + Cloudflare provide by default.
- Custom video transcoding (Cloudflare Stream's defaults are fine).

---

## 11. Open question summary (the "decide before coding" list)

| # | Decision | Owner | Target date |
|---|---|---|---|
| 1 | Play Billing vs RevenueCat (or roll-your-own) | User (financial) | v0.7.1 kickoff |
| 2 | Pricing parity between UPI and Play subs | User (financial) | v0.7.1 kickoff |
| 3 | Sentry SDK — yes or no? | User (operational) | Before v0.7.1 ships |
| 4 | Multi-region in v0.7.1 (i18n at minimum) | User (product) | v0.7.1 mid |
| 5 | Subtitle rendering — JS overlay or defer to v0.7.2 | Claude/developer | v0.7.1 mid |
| 6 | Episode ordering — auto-derive or manual number | User (UX) | v0.7.1 mid |
| 7 | TUS vs current fetch for uploads | Claude/developer | v0.7.1 early |
| 8 | Foreground service vs TUS-only for upload survival | Claude/developer | v0.7.1 early |
| 9 | Push notifications — Expo Push vs raw FCM | Claude/developer | v0.7.1 early |
| 10 | Grievance Officer for the privacy policy | User (legal) | **Before v0.7.0 launch (blocks §13 of privacy policy)** |

The single non-negotiable is #10 — the privacy policy can't ship without it, which means v0.7.0 can't ship without it.

---

## 12. Reference: source files that constrain these designs

For the implementer — every design above is constrained by something in the v0.7.0 codebase. The relevant files:

- `app.json` — what we declare to Play Store, what env vars exist, what plugins are wired
- `supabase/migrations/` — the v40-v45 RLS and schema decisions
- `supabase/functions/generate-stream-upload/index.ts` — the rate limit logic, the Cloudflare Stream integration
- `supabase/functions/delete-account/index.ts` — the data deletion flow
- `lib/iapHelpers.ts` — the UPI URL builder (keep for v0.7.1 UPI backup)
- `lib/services/playerPrefs.ts` — the per-user prefs store
- `lib/uploadQueue.persistence.ts` — the upload queue state machine
- `components/VideoPlayerOverlay.tsx` — the player; subtitle rendering and picture-in-picture are here
- `app/admin/subscription-requests.tsx` — the admin queue UI; this is what becomes "approval latency" in v0.7.1
- `app/my-subscription.tsx` — the user-facing sub UI; the "renewal reminder" banner goes here
- `docs/security-audit-v0.7.0.md` — the RLS audit; benchmarks for §6 start here
- `docs/payment-flow-v0.7.0.md` — the UPI flow; the Play Billing flow is parallel to this
- `docs/player-test-matrix-v0.7.0.md` — the manual test matrix; the seed for the E2E test suite

---

## 13. The "after v0.7.1" horizon (informational, not commitments)

For context on where v0.7.1 sits in the larger roadmap:

- **v0.7.2 (Q4 2026):** Subtitle rendering in the player, Sentry, push notifications live, episode reordering UI, plan-expiry cron in production, TUS uploads, ~100 paying users.
- **v0.8 (Q1 2027):** iOS app, Stripe + multi-currency, DRM / signed URLs (creator opt-in), AI captions, Hindi UI.
- **v1.0 (Q2 2027):** Federated / ActivityPub, web admin, real-time chat, creator analytics dashboard, in-app tipping, ad-supported free tier (AdMob finally wired in).
- **v1.x:** Live streaming (the schema has `live` content type but no UI in v0.7.0). Short-form feed (vertical swipe, TikTok-style — the `shorts` content type exists in RLS but no UI). Creator subscriptions (fans paying creators directly, takes 30% platform cut).

This doc is the bridge from v0.7.0's "manual, owner-in-the-loop" launch to v0.7.1's "automated, scales-to-1k-DAU" steady state. Everything past v0.7.1 is a separate design doc when the time comes.
