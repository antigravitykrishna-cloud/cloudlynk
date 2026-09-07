# Streamly — Production Deploy Runbook

**Target:** Play Store internal-testing track (first push) + Vercel-hosted admin.
**Last updated:** 2026-06-02

This runbook covers two independent deploys from the same Streamly launch:
1. **Mobile app** → EAS production build → Google Play internal track
2. **Admin dashboard** → Vercel production deployment

---

## 0. Pre-Flight (one-time, before either deploy)

### 0.1 Run the new database migration
The latest migration adds the `username` column and defensively normalizes the `plan` enum to `('free','standard','premium')`. **The mobile upgrade flow depends on this** — without it, the IAP success handler will fail when it tries to write `plan: 'standard'` or `'premium'`.

1. Open the **Supabase dashboard** for the `cloud` project (ref: `wdtwjiixuueqejfraaod`).
2. Go to **SQL Editor** → New query.
3. Paste the contents of `supabase/migration_v8.sql` and **Run**.
4. Verify with:
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles'
     AND column_name IN ('username', 'plan');

   SELECT DISTINCT plan FROM public.profiles;
   ```
   You should see `username` listed as `text` (nullable) and the constraint enforcing `('free','standard','premium')`.

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
