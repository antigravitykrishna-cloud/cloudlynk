# Streamly v0.8.0 — Handoff instructions

For whoever builds/finishes the frontend and handles the Play Console submission. Backend changes referenced here are already committed to `D:\Joliffy\jollify` (see `docs/PLAY_STORE_COMPLIANCE_AUDIT.md` for the full findings this responds to).

## 1. Apply the new migration first

`supabase/migrations/20260824120000_v46_compliance_hardening.sql` is written but **not yet applied** to the live database. Run it via `npx supabase db push --linked` or paste it into the Supabase SQL editor before testing any of the below. It:

- Removes the traffic-source-gated channel visibility policy (Finding 0 — do this regardless of which account eventually uploads the app; it's the finding most likely tied to the actual termination).
- Adds admin read/update access to `content_reports` (previously no admin could see reports at all).
- Extends `content_reports` with `post_id` (→ `channel_posts`) and `reported_user_id` (→ `profiles`) — the table previously only referenced the old `files`/`channels` model.
- Adds `public.user_blocks` (blocker_id, blocked_id) for user-blocking.
- Adds `profiles.birth_year` and wires it into the new-user trigger.

## 2. Already done on the client side (this codebase)

- `hooks/useAcquisitionSource.ts` and its call site are removed — no more ad-click-ID detection/reporting on launch.
- `app/(auth)/signup.tsx` now has a required birth-year field with a real 18+ check before account creation.
- `android/app/src/main/AndroidManifest.xml`: removed the unexplained `SYSTEM_ALERT_WINDOW` permission. **If a fresh `expo prebuild` regenerates this file and the permission comes back, find which dependency requests it (check whether `expo-dev-client` is being pulled into the release build — it shouldn't be) rather than just re-deleting the line each time.**
- `app/community-guidelines.tsx`: fixed the support/DMCA email domain to match `app.json` (`.in`, not `.app`).
- `docs/play-store-data-safety.md`: fixed the package name typo and added the new `birth_year` data point.

If the "revamp" is a rebuild from scratch rather than iterating on this codebase, replicate all of the above in the new frontend — they're small but load-bearing.

## 3. Still needs building: in-app report + block (Finding 2)

The backend is ready after step 1; the UI is not built yet. Needed:

- **Report button** on every piece of viewable content (and ideally on user profiles) → insert into `content_reports` with `reporter_id = auth.uid()` (automatic via RLS), `post_id`, and a `reason` (a short picker is fine: spam, harassment, copyright/DMCA, adult content, other + free text). This must be reachable from the normal viewing screen, not buried in settings.
- **Block button** on a user's profile/content → insert into `user_blocks` (`blocker_id` auto, `blocked_id` = the target). Once blocked, the blocked user's content should stop appearing for the blocker (a client-side filter or an RLS addition — your call on which is cleaner given the existing query patterns in `lib/posts.ts` / `lib/channelVideos.ts`).
- **Admin review queue** for reports: a screen like `app/admin/pending-channel-content.tsx` (same approve/reject pattern already in the codebase) but reading `content_reports` where `status = 'pending'`, and updating `status`/`reviewed_at`/`reviewed_by` on action.
- **Terms/guidelines acceptance should be a real gate, not just a link.** Right now signup shows "by creating an account, you agree to our Terms..." as static text with links — Play's UGC policy wants this to be something the user affirmatively accepts (a checkbox), not just adjacent text they could ignore. Small change, worth doing while touching this screen.

## 4. Open decision — do not build until answered (Finding 1)

The Premium subscription currently unlocks in-app features via a direct UPI deep link + manual screenshot approval, which bypasses Google Play Billing and is a real Payments-policy violation. Two ways to fix it, and the choice changes a meaningful chunk of the backend:

- **Real Google Play Billing** — `react-native-iap` and the `com.android.vending.BILLING` manifest permission are already in place, `IAP_PROVIDER` just needs to move off `"noop"`. Needs: products/subscriptions defined in Play Console matching the existing plan tiers (`lib/services/iap.ts` already has the plan list), a server-side receipt verifier (there's a stubbed `RECEIPT_VERIFIER_URL` in `app.json` already), and Play takes its standard service fee.
- **Enroll in Play's alternative billing program for India** — still integrates with Play's APIs (it's not "keep doing the UPI deep link as-is"), lower fee, more enrollment overhead with Google.

Whoever owns the Play Console account this ships under needs to make this call before that part of the backend gets built — happy to build either once decided.

## 5. Before resubmitting anywhere

- Run the three verification queries in `docs/PLAY_STORE_COMPLIANCE_AUDIT.md` (Finding 0) to confirm the old acquisition-source gating was never actually populated with real "paid-only" content in production.
- Confirm the live privacy policy page (`streamly-legal.vercel.app/privacy-policy`) actually has a real named Grievance Officer, not the placeholder — it was explicitly marked "blocked on launch until filled in" and shipped anyway last time.
- Don't flip `ADMOB_ENABLED` to true until there's a real (non-test) AdMob account and IDs — the manifest currently only has Google's public test App ID.
- Re-verify the Data Safety form against the app once the payment approach and report/block feature are actually built — both add real data categories (report reasons, block relationships, and Play Billing purchase data if that's the path taken).
