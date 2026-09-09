# Streamly — Production Deploy Runbook

**Target:** Play Store internal-testing track (first push) + Vercel-hosted admin.
**Last updated:** 2026-06-02

This runbook covers two independent deploys from the same Streamly launch:
1. **Mobile app** → EAS production build → Google Play internal track
2. **Admin dashboard** → Vercel production deployment

---

## 0. Pre-Flight (one-time, before either deploy)

### 0.1 Run the new database migrations

> **Rewritten 2026-09-10.** This section used to point at `supabase/migration_v8.sql`
> and tell you to normalize the `plan` enum to `('free','standard','premium')`,
> "because the IAP success handler writes `plan: 'standard'`". None of that is
> true any more: `plan` was superseded by `plan_status` in v48 and nothing has
> written it since — `verify-play-receipt` and `play-rtdn-webhook` both write
> `plan_status`. Following the old text did nothing useful and implied the
> legacy column still mattered.

Apply everything in `supabase/migrations/` that the project has not seen yet,
in filename order. The current head is
`20260910090000_v75_subscription_expiry_enforcement.sql`.

1. Open the **Supabase dashboard** for the `cloud` project (ref: `wdtwjiixuueqejfraaod`).
2. **SQL Editor** → New query → paste the migration → **Run**. One file at a time, in order.
3. Verify v75 specifically:
   ```sql
   -- 1. The premium gate honours the expiry date.
   --    Expect: is_plan_active listed, and the policy body containing it.
   SELECT proname FROM pg_proc WHERE proname = 'is_plan_active';

   SELECT pg_get_expr(polqual, polrelid) LIKE '%is_plan_active%' AS gate_fixed
   FROM pg_policy
   WHERE polname = 'channel_posts_select_v57';

   -- 2. Both sweepers exist and are service_role-only.
   SELECT proname, proacl FROM pg_proc
   WHERE proname IN ('expire_lapsed_plans', 'notify_expiring_plans');

   -- 3. The cron jobs are scheduled (empty result = pg_cron was not enabled;
   --    see below).
   SELECT jobname, schedule FROM cron.job
   WHERE jobname LIKE 'cloudlynk-%';
   ```

**If step 3 returns nothing**, `pg_cron` is not enabled on the project. The
migration creates the functions either way and says so in a `NOTICE` — access
revocation does *not* depend on the cron, because `is_plan_active()` ignores a
lapsed date on its own. What you lose without it is the `plan_status` column
catching up and the expiry notification being sent. To enable:

1. **Database** → **Extensions** → enable `pg_cron`.
2. Re-run the last `DO $$ ... $$` block of the v75 migration, or schedule by hand:
   ```sql
   SELECT cron.schedule('cloudlynk-expire-lapsed-plans',  '7 * * * *',  $$SELECT public.expire_lapsed_plans();$$);
   SELECT cron.schedule('cloudlynk-notify-expiring-plans', '37 9 * * *', $$SELECT public.notify_expiring_plans(3);$$);
   ```

### 0.2 Create the IAP products in Play Console

> **Corrected 2026-09-08.** This section previously described
> `streamly_standard_monthly` and `streamly_premium_monthly` at $4.99 and
> $12.99 — the old two-tier USD model from before the Cloudlynk rebrand.
> Following it would have created products the app never asks for, and every
> purchase would have failed with "product not found" *after* the Console
> setup was done. The values below are read straight from
> `lib/services/iap.ts`, which is what the app actually queries.

**Play Console → Monetize → Subscriptions → Create subscription.**

There is **one** subscription product with **four base plans**, not four
products. The app fetches `cloudlynk_premium` and then picks an offer by
`basePlanId`.

| Field | Value |
|---|---|
| Product ID | `cloudlynk_premium` |
| Name | Cloudlynk Premium |

Then add four base plans on that product:

| Base plan ID | Billing period | Price | Type |
|---|---|---|---|
| `silver-7d` | 1 week | ₹199 | Auto-renewing |
| `gold-1m` | 1 month | ₹259 | Auto-renewing |
| `platinum-6m` | 6 months | ₹599 | Auto-renewing |
| `diamond-1y` | 1 year | ₹999 | Auto-renewing |

**Activate every base plan.** One left in draft is invisible to the app, and
selecting it at checkout shows *"that base plan isn't live in Play Console
yet"* — the message comes from `iap.ts` when the offer lookup returns nothing.

The IDs must match exactly. They are compared as strings; a typo is not a
warning, it is a purchase that cannot complete.

Prices are set in INR because that is the market. Play converts for buyers in
other countries automatically.

**Subscriptions cannot be created until an app bundle has been uploaded** —
the Monetize section is empty on a new app. So the order is: upload the AAB to
Internal testing first, then come back and do this.

### 0.3 Generate the Play Store service account key
This is the `google-play-key.json` referenced in `eas.json`. You need it to automate submissions via `eas submit`.

1. **Google Cloud Console** → **IAM & Admin** → **Service Accounts** → Create service account.
2. Grant it the **Play Android Developer** role at the project level.
3. Create a JSON key for that service account.
4. Save the JSON file to the **repo root** as `google-play-key.json` (matching `eas.json` → `submit.production.android.serviceAccountKeyPath`).
5. **Do not commit it** — `.gitignore` already excludes it; verify with `git status`.

### 0.4 Get Play Console internal-testing track access
The user (developer) needs at minimum:
- **Admin** or **Release manager** role on the Play Console for the Streamly app
- The app created in the Console (package: `com.streamly.app`)

### 0.5 (Optional) Turn on Google Sign-In

The login screen offers **Continue as guest**, **Sign in with Google** and
**Continue with email**. Guest and email work with no setup. The Google button
is **hidden** until `GOOGLE_WEB_CLIENT_ID` is set — deliberately, since a
sign-in button that always errors is worse than one that isn't offered
(`isGoogleAuthLive()` in `lib/config.ts`).

To enable it:

1. **Install the native module** (it is lazy-required, so the app runs without it):
   ```bash
   npx expo install @react-native-google-signin/google-signin
   ```
2. **Google Cloud Console** → the project behind your Supabase auth → **APIs &
   Services** → **Credentials** → create two OAuth 2.0 client IDs:
   - **Android** — package `com.streamly.app`, plus the SHA-1 of the signing
     key. For a Play-signed release that is the SHA-1 from **Play Console →
     Setup → App integrity → App signing key certificate**, *not* your upload
     key. Getting this wrong is the usual cause of `DEVELOPER_ERROR`.
   - **Web** — this one's client id is what the app and Supabase both use.
3. **Supabase dashboard** → **Authentication** → **Providers** → **Google**:
   enable it and paste the **Web** client id and secret.
4. Add the **Web** client id to `app.json` under `expo.extra`:
   ```json
   "extra": { "GOOGLE_WEB_CLIENT_ID": "xxxxxxxx.apps.googleusercontent.com" }
   ```
5. Rebuild. The button appears on its own — no code change.

> The **Web** client id is correct in step 4, not the Android one. Supabase
> validates the ID token's audience against the web client, and the native
> sign-in mints a token for whatever is passed as `webClientId`.

---

## 1. Mobile — EAS Production Build

### 1.1 One-time EAS setup
```bash
cd D:\Joliffy\jollify
npm install -g eas-cli        # if not already
eas login                      # uses your Expo account
eas build:configure            # creates `extra.eas.projectId` in app.json
```
After this, `app.json → expo.extra.eas.projectId` will be populated. **Commit that change.**

### 1.2 Set the build-time env vars
EXPO_PUBLIC_* variables get inlined into the bundle at build time, so they must be available in the EAS build environment. They're public (not encrypted), which is correct — they're already shipped in the JS bundle.

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "<your-supabase-url>" --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<your-anon-key>" --environment production --visibility plaintext
```

> `--visibility plaintext` is intentional for EXPO_PUBLIC_* vars. Don't mark them as secrets.

**Repeat both commands with `--environment preview`.** A preview build is what
you hand testers; if only `production` is set, the test APK is the broken one.

**If you skip this step the build still succeeds.** `.env` is excluded from EAS
uploads by `.easignore`, and `eas.json` sets only `APP_ENV`, so the bundler
inlines empty strings and every network call fails at runtime with an opaque
error — an app that installs, opens, and does nothing. Since 2026-09-10
`lib/supabase.ts` throws a named error at launch instead, so this shows up on
the first run of the first build rather than after a Play upload. If you see
*"Cloudlynk is not configured"*, this section is the fix.

### 1.3 (Optional) Verify with a preview build first
Before going to production, kick a preview APK to confirm the bundle wires up:
```bash
eas build --platform android --profile preview
```
This produces a downloadable `.apk` you can install on a physical device and verify:
- Login/signup round-trip
- Upload to a channel
- Admin sees the new content in the queue
- Free user hits the 30-min paywall
- IAP purchase flow (use a real Google account; in-app purchase sandbox testing requires a tester license)

### 1.4 Production build
```bash
eas build --platform android --profile production
```
This produces a signed `.aab` (Android App Bundle). The first build is slow (10–20 min for a fresh EAS environment); subsequent builds are faster.

### 1.5 Submit to Play Store internal track
```bash
eas submit --platform android --latest
```
This:
1. Uploads the latest AAB to the **internal testing** track
2. Uses the service account from `google-play-key.json`
3. The AAB will appear in Play Console → **Testing** → **Internal testing** within a few minutes

### 1.6 (Optional) Internal testing promotion
Once the build is in internal testing:
1. Add testers (email addresses) under **Internal testing** → **Testers** tab.
2. Testers get an opt-in link to install.
3. After validation, promote to **Closed testing** (alpha/beta) and eventually **Production**.

---

## 2. Admin — Vercel Deploy

The admin is a Next.js 16 app at `D:\Joliffy\streamly-admin`. It's already production-ready after today's fixes (middleware protecting /api, removed dead dep, fixed unescaped entities in privacy page).

### 2.1 First-time Vercel setup
```bash
cd D:\Joliffy\streamly-admin
npm install                    # picks up the package.json change (auth-helpers removed)
npx vercel login               # if not already authenticated
npx vercel link                # creates .vercel/project.json, links the folder to a Vercel project
```

### 2.2 Set the Vercel env vars
The admin needs four env vars. Two are public (exposed to the browser), two are server-only secrets.

**Set these via Vercel dashboard** (Project → Settings → Environment Variables) **or** via CLI:
```bash
# Public — visible in the browser bundle
npx vercel env add NEXT_PUBLIC_SUPABASE_URL       production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY  production

# Server-only secrets — must be marked sensitive
npx vercel env add SUPABASE_SERVICE_ROLE_KEY      production --sensitive
npx vercel env add ADMIN_SECRET                   production --sensitive
```

> `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It must NEVER be exposed to the client. The Vercel `--sensitive` flag prevents it from being readable in the dashboard and prevents it from being inlined into the client bundle.
>
> `ADMIN_SECRET` is the password for the admin login. Pick a strong random value; the user only types it once per session (cookie lasts 7 days).

### 2.3 First deploy
```bash
npx vercel --prod
```
This:
1. Detects Next.js automatically
2. Runs `next build` on Vercel's infrastructure
3. Deploys to `https://<project-name>.vercel.app`
4. Outputs the live URL

### 2.4 Verify the deploy
- Visit `https://<your-vercel-url>/login` — should show the Streamly admin login page
- Log in with `ADMIN_SECRET`
- Confirm the Users, Channels, Content, Creator Requests tabs all render with data
- Verify the privacy policy page is live: `https://<your-vercel-url>/privacy` — this is the **URL to use in the Play Store listing**

### 2.5 (Optional) Custom domain
For a polished client-facing URL like `admin.streamly.app`:
1. In Vercel: **Project → Settings → Domains** → add the domain
2. Update DNS with the CNAME Vercel provides
3. Update the Play Store privacy policy URL to the custom domain

---

## 3. Post-Deploy: Play Store Listing

Required before the app is publicly installable (after internal testing passes):

### 3.1 Store listing assets
| Asset | Size | Notes |
|---|---|---|
| App icon | 512×512 PNG | Replace `assets/icon.png` with a Streamly-branded icon (cloud logo + wordmark on `#0d1117`). Current icon is a generic play button. |
| Feature graphic | 1024×500 PNG/JPG | Showcases the app — Netflix-style hero, channel list, dark theme. |
| Phone screenshots | 1080×1920+ (min 2, max 8) | Capture from running app: Home, Files, Channel Detail, Video Playback, Paywall. |
| 7-inch tablet screenshots | 1200×1920+ (optional) | Same screens, tablet layout. |
| 10-inch tablet screenshots | 1600×2560+ (optional) | Same. |

### 3.2 Listing copy
- **Short description (80 chars):** "Streamly — cloud storage, channels, and a 30-min free preview."
- **Full description:** Use the copy already in `README.md` (under "Play Store Description").
- **Privacy policy URL:** `https://<vercel-admin-url>/privacy` (set after Vercel deploy).
- **Category:** Productivity (or Entertainment — your call; Productivity gets less restrictive review).
- **Content rating:** Complete the questionnaire in Play Console. Expect "Medium Maturity" given user-generated content.
- **Data safety form:** Declare: email, name, photos/videos uploaded, usage data, push tokens.
- **Target audience:** 13+ (the Terms of Service requires this; Data Safety needs to match).

### 3.3 First release notes
"What's new in 1.0.0 — initial release."

---

## 4. Smoke test checklist (run after both deploys)

End-to-end sanity check before announcing to the client:

- [ ] Mobile user can sign up
- [ ] Mobile user can log in
- [ ] Mobile user can upload a file to Files
- [ ] Mobile user can create a public channel (lands in pending)
- [ ] Admin sees the pending channel and can approve it
- [ ] Mobile user receives the channel-approved push notification
- [ ] Mobile creator can upload a video to their channel (lands in pending)
- [ ] Admin can approve the video
- [ ] Mobile user can play the video in the channel
- [ ] Free user hits the 30-min paywall at the right time
- [ ] User upgrades via Google Play (use a test account); profile shows new plan + new storage limit
- [ ] Acquired (paid-attribution) user can see the Channels tab; organic user cannot
- [ ] Privacy policy URL is reachable from Play Store listing

---

## 5. Rollback

- **Mobile:** Vercel/EAS has no atomic rollback. To roll back a Play Store release, create a new AAB with an incremented `versionCode` and submit. The previous build can be deactivated in Play Console.
- **Admin:** Vercel keeps every deploy. `vercel rollback` (CLI) or **Project → Deployments → Promote to Production** (dashboard) reverts in ~30 seconds.
- **Database:** Migration v8 is forward-only (no `DROP COLUMN`, no destructive `UPDATE`). If something goes wrong, the changes are additive and can be left in place without rollback.
