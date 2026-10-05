# Streamly — Play Store Compliance Audit

**Date:** 24 Aug 2026
**Scope:** `com.streamly.cloud`, branch `launch-hardening`, working tree as staged from `D:\Joliffy\jollify`
**Purpose:** Answer "is this the app's fault?" before re-upload under a new account (SMU).

---

## Bottom line

Google's termination reason ("High Risk Behavior Patterns... linked to prior terminated accounts") is an **account-linkage flag**, not a citation of a specific policy section. That flag alone won't be fixed by changing the app. But a full scan of the codebase (not just docs) turned up **three independent, real issues already live in v0.7.0** that would very plausibly get *any* account holding this app flagged, reviewed slowly, or banned — regardless of which developer account uploads it: dormant but fully-built traffic-source content cloaking (Finding 0), a payments flow that bypasses Google Play Billing (Finding 1), and a public UGC app with no in-app report/block mechanism (Finding 2). Fix these before re-uploading anywhere, SMU account included, or the same pattern likely repeats.

---

## Finding 0 — Traffic-source-based content gating (Critical, new — found in full scan)

**What's happening:** `hooks/useAcquisitionSource.ts` detects, on every app launch, whether the install/open came from a tracked ad click (it parses the initial deep-link URL for `gclid`, `fbclid`, `ttclid`, `utm_*`) and writes `organic` or `paid` to `profiles.acquisition_source` in Supabase. Starting in `supabase/migration_v10_organic_rls.sql` and refined through `v11` and `v28`, the backend RLS policies use that value (and a matching `channels.acquisition_source` / `channel_posts.visibility = 'ad_attributed'` column) to show certain channels and posts **only** to users whose install was attributed to a paid ad click — invisible to everyone else, organic users included.

**Why this is serious:** this is the technical shape of "cloaking" — content whose visibility depends on how the visitor arrived, specifically so that some content is hidden from default/organic traffic (which is what a reviewer's install or a plain link-open looks like) while shown to a different, ad-attributed segment. That's precisely the pattern Google's Deceptive Behavior policy and its automated abuse detection are built to catch, and precisely the kind of behavior that produces exactly the classification you got ("High Risk Behavior Patterns"), independent of the account-linkage question.

**Important nuance, in fairness:** I checked `app/admin.tsx` and found no UI anywhere that lets an admin actually set a channel's `acquisition_source` to `'paid'` or a post's `visibility` to `'ad_attributed'`. Every channel/post defaults to `'organic'`/`'public'` and nothing in the shipped app changes that. So this looks like it was built out (across three separate migrations, so it was a deliberate, considered feature) and then never wired to any control surface — most likely dormant rather than actively operated. But the client-side detection code still runs and reports install-attribution data on every launch regardless, and the backend machinery to act on it is fully live.

**Verify before doing anything else:** run this in the Supabase SQL editor to confirm it's actually inert:
```sql
select count(*) from channels where acquisition_source <> 'organic';
select count(*) from channel_posts where visibility = 'ad_attributed';
select count(*) from profiles where acquisition_source = 'paid';
```
If all three come back zero (or near-zero, matching only test/dev accounts), this was never operated in practice. Either way, I'd remove it before resubmitting anywhere:
- Delete `hooks/useAcquisitionSource.ts` and its call sites (stop collecting/reporting install-attribution data client-side).
- Drop the `acquisition_source`/`visibility='ad_attributed'` RLS branches so all approved public content is visible uniformly, regardless of how the viewer arrived.

This is the single finding I'd treat as most likely connected to the actual termination — more than the payments issue below — because it matches Google's stated behavioral category, not just a financial-policy category.

---

## Finding 1 — Payments bypass Google Play Billing (Critical)

**What's happening:** The "Premium subscription" is unlocked entirely through a direct UPI deep link (`upi://pay?...`) with a screenshot the user uploads and an admin manually approves (`docs/payment-flow-v0.7.0.md`, `app/my-subscription.tsx`, `app.json` → `extra.UPI_ID: "2728412a@bandhan"`). No Google Play Billing is involved. `docs/play-store-data-safety.md` even states this outright: *"v0.7.0 has no in-app purchase / no Play Billing... the Payment section is NOT required."*

**Why it's a violation:** Google Play's Payments policy requires Play Billing for exactly this category — "subscription services... or other content subscription services" and "app features/content" unlocked in-app. Direct-to-UPI-VPA payment for a digital subscription, verified by a human looking at a screenshot, is precisely the pattern Google's Payments policy prohibits and that its fraud systems are tuned to catch (off-platform real-money transfer + unlockable digital feature + manual/unverifiable confirmation). India does have a legitimate "alternative billing" (User Choice Billing) program, but it requires formal enrollment through Play Console and still integrates with Play's billing APIs — it is not the same as an ad hoc UPI deep link.

**Why this matters for the termination:** This is exactly the kind of live financial-circumvention pattern that correlates with "High Risk Behavior" classification — not just app-content risk, but developer-account risk. It is very likely a real contributor, separate from whatever prior account is linked.

**Fix path:** `react-native-iap` and the `com.android.vending.BILLING` manifest permission are already present (currently `IAP_PROVIDER: "noop"`). The straightforward compliant path is to wire real Google Play Billing for the Premium subscription and retire the UPI/screenshot flow for unlocking app features. This is a genuine product decision (Play takes a service fee; pricing/SKUs need to be redefined) — flagging it rather than silently rewriting your payment system.

---

## Finding 2 — No in-app report/block for a public UGC app (High)

**What's happening:** Streamly is a public short-video platform. There's a solid **pre-publish** admin queue (`app/admin/pending-channel-content.tsx` — approve/reject before content goes live), which is good. But there is no in-app way for an ordinary *user* to report a piece of content or block another user once it's live — I checked the main content-viewing screen (`app/(tabs)/channels/[id].tsx`) and found no report/block/flag code paths at all.

**Why it's a violation:** Play's User Generated Content policy requires "an in-app system for reporting and blocking objectionable UGC and users," specifically calling out that public-facing social platforms need to let people report both content and users — not just have staff pre-screen uploads.

**Compounding issue:** `app/community-guidelines.tsx` already *tells users* "We review all reports and take action within 48 hours" — but there's no report button anywhere for them to file one. That's a policy promise with no code behind it, which is worse than not mentioning it.

**Fix path:** Add a report action (content + user) surfaced from the viewer and channel screens, backed by a `content_reports` / `user_reports` table + an admin review queue (mirroring the existing `pending-channel-content` pattern), plus a block-user feature if there's any user-to-user interaction surface.

---

## Finding 3 — Age gate is claimed but doesn't exist (Medium-High)

`docs/privacy-policy-outline.md` §9 states: *"The signup form requires a birth year and rejects users under 18."* I checked `app/(auth)/signup.tsx` directly — there is no birth-year field, no age checkbox, nothing. The live privacy policy (if published as written) is making a factual claim about the app that isn't true, which is its own problem, and combined with Finding 2, this is the exact profile — public UGC video app, no live moderation reporting, no age screening — that Play's trust & safety systems scrutinize hardest for CSAE risk, which is the single most zero-tolerance category on Play.

**Fix path:** Either add a real (even if self-attested) age-gate field to signup, or correct the privacy policy to stop claiming one exists. Given the content category, I'd do the former — it's a small form field and materially reduces risk.

---

## Finding 4 — Unexplained `SYSTEM_ALERT_WINDOW` permission (Medium)

The built manifest (`android/app/src/main/AndroidManifest.xml:12`) requests `SYSTEM_ALERT_WINDOW` ("draw over other apps"). It's not declared in `app.json`'s permission list, not mentioned in the privacy policy's permission section, and nothing in the app's own code appears to use it — it's most likely pulled in transitively by a dependency (possibly `expo-dev-client`, which should not ship in a production manifest at all). This permission is one Play's automated abuse detection weighs heavily, especially paired with an app that also handles real payments — it's a common signature of overlay/click-fraud and fake-login-screen malware, even when the actual cause here is benign.

**Fix path:** Find the source (check whether `expo-dev-client` is being included in the release build config) and strip it from the production manifest if nothing in the app genuinely draws overlays.

---

## Finding 5 — Documentation/reality mismatches (Low, but adds up)

These aren't policy violations by themselves, but they're the kind of sloppiness that compounds the "low-trust, fast-churning developer" profile Google's systems build up over repeated submissions:

- `docs/play-store-data-safety.md` header says package `com.streamly.app` — actual package is `com.streamly.cloud`. If this doc was used to fill the live Data Safety form under the wrong app, it needs to be redone against the real app.
- Support/DMCA email addresses are inconsistent: `community-guidelines.tsx` uses `support@streamly.app` / `dmca@streamly.app`; `app.json` and the data-safety doc use `support@streamly.in`. Pick one domain that's actually live and monitored, everywhere.
- Privacy policy outline §13 (Grievance Officer, required under India's DPDPA) is explicitly marked *"BLOCKED on launch until this is filled in"* — worth confirming the live page at `streamly-legal.vercel.app/privacy-policy` actually has a real name in that field before resubmitting, not just a placeholder.

---

## Finding 6 — Test AdMob IDs baked into the release manifest (Low for now)

`AndroidManifest.xml` hardcodes Google's public **test** AdMob App ID via `tools:replace`, and `ADMOB_ENABLED: false` in `app.json`. This is fine as long as no ad is ever actually requested/shown in production. It becomes a real AdMob policy violation (serving test ads to real users, or the reverse) the moment `ADMOB_ENABLED` flips to true without swapping in the real IDs from the new `streamly-ads@gmail.com` account. Just flagging so it isn't missed at cutover.

---

## What I did *not* change

I didn't touch the payment flow or build the report/block feature yet — both are real engineering + product decisions (Play Billing fee structure, report-queue UX, moderation SLAs) that should be confirmed with you/the client before I start rewriting money-handling and moderation code. Everything else above is either a doc fix or a small, low-risk code change I can do next if you want.

---

## Which device should this be built/uploaded on?

Two different questions hide inside this — worth separating:

**Writing and building the code (v0.8.0 development, compiling the AAB, testing on the S24 Ultra):** doesn't matter at all. Do that on whatever machine is convenient — this device, a laptop, a CI runner. Nothing about where code gets compiled has any bearing on Play policy or account risk.

**Registering/using the new SMU Play Console account and doing the actual upload:** this is where I'd stop and separate two things. Using a genuinely different, legitimate account (an SMU-affiliated one, since `app.json`'s `owner: "southern-methodist-university"` shows there's already a real Expo/EAS org tied to the university) is not something I have any issue with — that's a different real identity, not evasion. But your own blueprint already documents Google's stated reason as *signal-based linkage* — device fingerprint, IP, install fingerprint, not just "same email." If the new account is set up and the app is uploaded from the same physical machine/network/browser profile that was used for AYUB TRADERS, there's a real chance the same linkage signal fires again regardless of which account it is. That's a plain fact about how the detection works, not a suggestion — I'm not going to give you the tactical version of that advice (which browser profile, which network, which payment instrument to use to avoid detection), since that crosses into helping route around Google's enforcement, which I'll still decline to do even for a legitimately different account.

**More important than the device question:** your blueprint is explicit that the AYUB TRADERS appeal was still pending as of 23 Aug, expected to resolve ~28 Aug, and that your own prior research concluded *creating or touching a new developer account while an appeal is open can auto-fail the appeal and trigger a permanent cross-ban.* If that appeal hasn't resolved yet, setting up the SMU account now — on any device — works against you before the device question even matters. Confirm the appeal's status first.

---

## Suggested order of operations

1. Check the AYUB TRADERS appeal status. If it's still open, wait for the verdict before touching any other Play Console account, per your own blueprint's finding.
2. Investigate and very likely remove Finding 0 (acquisition-source content gating) — run the three verification queries above first.
3. Fix Findings 3, 4, 5 — small, unambiguous, no product tradeoffs.
4. Decide the payment approach for Finding 1 (real Play Billing vs. formally enrolling in India's alternative billing program) — this determines a chunk of v0.8.0 scope.
5. Build the report/block feature (Finding 2) — needed regardless of the payment decision.
6. Re-verify the live privacy policy page and Data Safety form against the corrected app before any resubmission.
7. Only then reupload — build can happen anywhere; which account/device actually submits is a business decision, made with eyes open about the linkage-signal risk above.
