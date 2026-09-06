# Cloudlynk — where things stand

Branch `harden/r2-stream`, 15 commits on an unmodified baseline of the
2026-09-05 handover. `npx tsc --noEmit` is clean and the app bundles
(`npx expo export --platform android` → 6 MB, no errors).

Read this first, then `docs/DEPLOY_V57_V58.md` when you have a Supabase login.

---

## The one thing to know

**Paid subscriptions could never activate.** Not a design flaw — a dead string.

`protect_profile_privileged_fields` decides whether a writer is allowed to set
`plan_status`. One of its three trusted-writer tests reads
`request.jwt.claim.role`, the **legacy** PostgREST setting, removed in
PostgREST 10 and replaced by `request.jwt.claims`. On your project it is never
populated, so that test has always been false.

Both billing functions write `plan_status` through exactly that path. So:

```
user pays → Google takes the money → receipt verifies
          → iap_purchases row written → plan_status stays 'free'
```

The `UPDATE` succeeded. `updateErr` was `null`. Nothing logged. The customer
paid and got nothing.

Confirmed empirically, not inferred: one service-role `UPDATE` setting
`full_name` (unprotected) and `plan_status` (protected) in the same statement
persisted `full_name` and reverted `plan_status`.

Fixed in **v58**. The same bug would have hit the web + UPI checkout, since that
also has to write `plan_status` — so it is fixed before you build it.

---

## What was found and fixed

| # | Severity | Finding |
|---|---|---|
| 1 | **Critical** | Paid subscriptions never activated (above) |
| 2 | High | Premium videos served **unsigned** until first play — permanently, if nobody played them |
| 3 | Med-High | Suspended and banned viewers kept full premium feed and playback |
| 4 | Medium | The banned UPI/manual-approval payment system was still live and callable over PostgREST |
| 5 | Medium | Suspending an **admin** did not remove their admin powers |
| 6 | Med-Low | `activate_approved_channels()` was callable by any signed-in user |
| 7 | Low | A channel owner may be able to self-approve their channel (unverified — needs a live policy check) |

Plus the admin gap you listed: **edit metadata, replace thumbnail, replace video**
did not exist at all. Remove-and-re-upload was the only remedy, and it changed
the post id — silently orphaning every individual access grant on that post.
Built in v59.

### Four things caught in my own work before they shipped

Worth listing, because the pre-flight you asked for is what caught three of them:

1. **v57 would have broken GDPR data export.** It moved
   `subscription_requests` to another schema; `export_my_data()` reads
   `public.subscription_requests` and is `SECURITY DEFINER` with a pinned
   `search_path`. Every account export would have failed. Now a `REVOKE`.
2. **v58 would have removed the approval gate.** It replaced the profile
   trigger with a body based on v52, dropping the four lines v55 added to
   protect `approval_status`. Any user could then have self-approved.
3. **v60 would have failed to apply.** I rewrote two v56 functions from memory
   and referenced `revoked_at` / `revoked_by`, which do not exist on
   `content_access_grants`. It also dropped validation and parameter defaults.
   Both bodies are now the originals verbatim with one line changed.
4. **v60 would have frozen channel counters.** Its trigger governed
   `member_count` and `post_count`, which four `SECURITY DEFINER` functions
   write without marking themselves trusted — member counts would have stopped
   moving on join and leave. Now governs only the columns that decide access.

The harness lied too, at first: it set `plan_status` on test users, the trigger
reverted it, and it happily reported 7/8 on seven identical free users. It now
reads its fixtures back and refuses to run if they did not take.

---

## Rebrand

Orange and neon green on near-black → navy with a blue→cyan gradient, matching
the icon, feature graphic and splash.

The token file alone would have changed almost nothing: **34 of 38 screens
hardcode their colours.** So it is a token layer plus a literal migration across
the screens — 309 replacements in 24 files, in two passes. The second pass
caught values legible on near-black and not on navy (`#444` body text, a
full-width `#f0fdf4` panel that would have been a white slab).

The logo was the 512px launcher PNG scaled to 24px. It is now drawn with
`react-native-svg` — sharp at any size, themed, no asset.

The app now opens on **Explore**.

Preview: https://claude.ai/code/artifact/f81cd44c-42f7-47ab-97b8-bbbccd8a7f22

**Not yet seen on a device.** A type checker cannot see contrast.

---

## Play Store listing

Written and ready to paste — `docs/PLAY_STORE_LISTING.md`, or the shareable
version: https://claude.ai/code/artifact/67a25661-8464-48a7-b389-5ac438a0d384

The useful discovery: **this is not an adult-content app.** Your own Community
Guidelines ban explicit sexual content outright, and `signup.tsx:44` genuinely
rejects under-18s. The 18+ is an account-age requirement for a UGC platform, not
a content rating — so the questionnaire can be answered straight and the listing
does not have to dance around anything.

Report, block and pre-publish review all exist, which is exactly the three
things Play's UGC policy requires. Say so in the review notes.

---

## What only you can do

Nothing below is blocked on more engineering.

| # | Blocker | Why it needs you |
|---|---|---|
| 1 | **Supabase login** | `npx supabase login` opens a browser. Four migrations and six edge functions are written and waiting. Runbook: `docs/DEPLOY_V57_V58.md` |
| 2 | **Database password** | For the baseline migration. Not the same as the service key — that cannot drive `pg_dump`. See `supabase/BASELINE.md` |
| 3 | **Keystore passwords** | Not in the handover archive. The release AAB cannot be signed without them |
| 4 | **Play Console account** | Nothing about billing can be tested against reality until it exists |
| 5 | **`terms.ts` says Play Billing** | Contradicts the web+UPI decision, and it is published at the URL the listing links to |
| 6 | **Google auth provider** | Still enabled server-side. Dashboard → Authentication → Providers → off |
| 7 | **`CLOUDFLARE_STREAM_CUSTOMER_CODE`** | Verify it is set, or signed playback 500s on every premium play |

### Also: this machine cannot build the AAB

No JDK, no Android SDK. The source is ready — versionCode synced to 8, signing
wired, `-PCLOUDLYNK_REQUIRE_RELEASE_SIGNING=true` turns the silent debug-signing
fallback into a build failure. Someone with a toolchain and the keystore
passwords runs `./gradlew bundleRelease`.

**Correction to the handover, and to what I said earlier.** The handover states
the v0.7.0 APK is debug-signed. It is not. Read out of its APK Signing Block,
the certificate is:

```
CN=Cloudlynk, O=Cloudlynk, OU=Cloudlynk, L=Unknown, ST=Unknown, C=IN
```

The repo's `debug.keystore` is `CN=Android Debug, O=Unknown, OU=Android, C=US`.
They do not match, so that APK was signed with the real release keystore —
meaning whoever built it had the passwords configured outside the repo, in
`~/.gradle/gradle.properties`. Worth asking them, since it is the fastest route
to the credential that is otherwise blocking a signed build.

The silent-fallback hazard in `build.gradle` was still real and is still worth
the guard that now fails the build loudly — it just did not fire for that
artifact.

---

## Test fixtures still in production

You asked for `--keep`. All prefixed `_authtest_`, channel is `is_public=false`
so no real user sees them. Cleanup SQL is in `docs/DEPLOY_V57_V58.md` §9.

One thing to know: my diagnostic probe set `full_name` on test user
`6dd1d4e4-…` to a probe marker. Throwaway account, but it was a write made
outside the harness.

---

## What is NOT verified

Being explicit, because several things read as finished and are not:

- **Nothing is deployed.** v57–v60 and six edge functions are written, reviewed
  and unapplied.
- **The access matrix is 5/8 proven.** Free, revoked grant, removed content and
  unauthenticated genuinely pass. The explicit-grant case passes and closes
  handover open item #1. Active premium, expired premium and banned-with-plan
  could not be established until v58 lands.
- **Admin edit and video replacement have never run.** No device, no real
  Cloudflare upload.
- **Draft status has never been exercised.** v56 made it possible; nobody has
  saved one.
- **The rebrand has never been on a screen.**
- **Finding 7 is unconfirmed.** One read-only `pg_policy` query settles it; the
  query is in `docs/ADMIN_WORKFLOW_STATUS.md`.

---

## Map

| Path | What |
|---|---|
| `docs/DEPLOY_V57_V58.md` | The runbook. Start here once you can log in |
| `docs/DATABASE_REPRODUCIBILITY_AUDIT.md` | Why the schema is not really in version control |
| `docs/R2_AND_STREAM_AUDIT_2026-09-06.md` | R2 is unused; the three Stream defects |
| `docs/ADMIN_WORKFLOW_STATUS.md` | The 11 admin requirements, and the live check for Finding 7 |
| `docs/PLAY_STORE_LISTING.md` | Paste-ready listing copy |
| `supabase/BASELINE.md` | The from-scratch database problem |
| `supabase/rollback/v57_v58_rollback.sql` | Targeted rollback |
| `scripts/verify-stream-access.mjs` | The 8-case access matrix |
| `scripts/audit-schema-sources.mjs` | Schema inventory, offline |
| `scripts/audit-admin-guards.mjs` | Every admin RPC's server-side guard |
