# Turning on payments — step by step

Everything here is either a command to paste or a click path. Where a step
needs a value only you have, it says so and says where to find it.

**Order matters.** Step 1 is five minutes and fixes a bug that would otherwise
silently eat every payment. Step 2 has a multi-week wait and should be started
today in parallel.

---

## Step 1 — Deploy the backend (5 minutes)

Do this first. Without v58, a customer can pay Google successfully and **still
not get Premium**, with no error anywhere. You have already seen this bug:
it is why `admin@cloudlynk.app` came out as non-admin.

```bash
cd C:\cloudlynk
```

```bash
npx supabase login
```

Opens a browser. Sign in with the Supabase account that owns project
`wdtwjiixuueqejfraaod`.

```bash
npx supabase link --project-ref wdtwjiixuueqejfraaod
```

It asks for the **database password** — Dashboard → Project Settings → Database
→ Database password. If nobody knows it, "Reset database password" there is
safe; it does not affect the API keys the app uses.

```bash
npx supabase migration list --linked
```

Expect v57, v58, v59, v60, v61, v62, v63 listed as local-only. **Take a
snapshot before changing anything:**

```bash
mkdir backups
npx supabase db dump --linked -f backups/pre-v57.sql
```

Then apply:

```bash
npx supabase db push --linked
```

Then the edge functions — **after** the migration, never before, because the
new function code calls RPCs that do not exist until it lands:

```bash
npx supabase functions deploy verify-play-receipt
npx supabase functions deploy play-rtdn-webhook
npx supabase functions deploy stream-playback-token
npx supabase functions deploy stream-set-access
npx supabase functions deploy generate-stream-upload
npx supabase functions deploy admin-replace-video
```

And the secret I recovered from your Cloudflare account:

```bash
npx supabase secrets set CLOUDFLARE_STREAM_CUSTOMER_CODE=cw3q2266ctwnl4hi
```

### Verify it worked

```bash
node scripts/verify-guest-access.mjs
```

Expect no leaks. Then, in the SQL editor, confirm the entitlement path is
alive — this is the exact call `verify-play-receipt` makes:

```sql
select public.apply_play_entitlement(
  'b78040c4-8dfd-44ba-b771-8f44a626cdf9', 'active', now() + interval '30 days');

select plan_status, plan_expires_at from public.profiles
where id = 'b78040c4-8dfd-44ba-b771-8f44a626cdf9';
```

`plan_status` must read `active`. If it still reads `free`, v58 did not apply —
stop and fix that before going near Play Console, because every purchase after
that point silently fails.

Then put it back:

```sql
select public.apply_play_entitlement(
  'b78040c4-8dfd-44ba-b771-8f44a626cdf9', 'free', null);
```

### While you are in the SQL editor

Make the admin account actually admin. **Both lines in one execution** —
`set_config(..., true)` is transaction-local, so running them separately does
nothing:

```sql
select set_config('app.trusted_update', 'true', true);
update public.profiles
set is_admin = true, account_status = 'active', approval_status = 'approved'
where id = 'b78040c4-8dfd-44ba-b771-8f44a626cdf9';
```

And add the password-reset deep link: Dashboard → Authentication → URL
Configuration → Redirect URLs → add `cloudlynk://reset-password`.

---

## Step 2 — Play Console (start today, finishes in days-to-weeks)

### 2a. The account

play.google.com/console → **$25 one-time**.

Google then verifies your identity: government ID, and for an organisation
account, business documents. **This is the long pole and nothing shortens it.**
Everything below waits on it, so start it before anything else on this page.

### 2b. Create the app

**All apps → Create app**

| Field | Value |
|---|---|
| App name | Cloudlynk |
| Default language | English (India) or English (US) |
| App or game | App |
| Free or paid | **Free** — the app is free; Premium is an in-app subscription |

### 2c. Upload a build first

**Products → Subscriptions is empty until an app bundle exists.** So:

**Testing → Internal testing → Create new release** → upload the signed AAB.

That AAB needs the keystore passwords (see `docs/BUILD_LOCAL.md` §4). The one
in your Downloads right now is debug-signed and Play will reject it.

### 2d. Create the subscription

**Monetize → Subscriptions → Create subscription**

- **Product ID:** `cloudlynk_premium` — exactly this, it is hardcoded in
  `lib/services/iap.ts`
- Name: Cloudlynk Premium

Then **four base plans**. The IDs must match exactly; the app looks up the
offer by `basePlanId` and a mismatch shows *"that base plan isn't live in Play
Console yet"* at purchase time:

| Base plan ID | Billing period | Price | Type |
|---|---|---|---|
| `silver-7d` | 1 week | ₹199 | Auto-renewing |
| `gold-1m` | 1 month | ₹259 | Auto-renewing |
| `platinum-6m` | 6 months | ₹599 | Auto-renewing |
| `diamond-1y` | 1 year | ₹999 | Auto-renewing |

Activate each one. A base plan left in draft is invisible to the app.

### 2e. Service account, so the server can verify receipts

`verify-play-receipt` calls Google's Play Developer API to confirm a purchase
is real. A rooted phone can fake a successful purchase locally, so this check
is what actually decides.

1. **Google Cloud Console** → same project as Play Console → **IAM & Admin →
   Service Accounts → Create**
2. Create a **JSON key** and download it
3. **Play Console → Users and permissions → Invite user** → paste the service
   account email → grant **View financial data** and **Manage orders and
   subscriptions**
4. Load the key as a Supabase secret — from the folder holding the JSON:

```bash
npx supabase secrets set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON="$(cat your-key.json)"
```

Keep that file out of the repo. `google-play-key.json` is already gitignored.

### 2f. Real-time notifications (renewals, cancellations, refunds)

Without this, a cancelled subscription keeps working until it expires and a
refund never revokes access.

1. **Google Cloud Console → Pub/Sub → Create topic**, e.g. `play-rtdn`
2. **Create subscription** on that topic, type **Push**, endpoint:
   `https://wdtwjiixuueqejfraaod.supabase.co/functions/v1/play-rtdn-webhook`
3. **Play Console → Monetize → Monetization setup → Real-time developer
   notifications** → paste the topic name → **Send test notification**

---

## Step 3 — Flip the switch (2 minutes, after step 2)

In `app.json`:

```json
"IAP_PROVIDER": "google_play"
```

That single string is what `isIapLive()` reads to choose the real Play Billing
service over the no-op stub. Then rebuild and upload:

```bash
cd C:\cloudlynk\android && .\gradlew bundleRelease -PCLOUDLYNK_REQUIRE_RELEASE_SIGNING=true
```

### Test it before announcing anything

Play Console → **Setup → License testing** → add your own Gmail address. Test
accounts purchase without being charged and renew on an accelerated clock (a
monthly plan renews every ~5 minutes), so you can watch a full cycle in an
afternoon.

Install from the **Internal testing** link, buy Gold, then confirm in SQL:

```sql
select email, plan_status, plan_expires_at
from public.profiles where email = '<your test account>';
```

`active`, with an expiry roughly a month out. If it says `free`, v58 did not
deploy — go back to step 1.

---

## About UPI

Play does not allow paying for in-app digital content outside Play Billing. So
UPI cannot be a second button next to Play Billing inside the app. Two legal
routes:

**Sell on the web.** Your own checkout page, any Indian gateway (Razorpay,
Cashfree, PhonePe), webhook → `apply_play_entitlement()` — the v58 RPC is
already the right entry point. The catch is Play's anti-steering rule: the app
may not link to it or mention it, so the sale has to happen *before* the
install, driven by your Meta ads:

```
Meta ad → landing page → UPI checkout → install → sign in → Premium already active
```

**User Choice Billing.** A formal Play Console enrolment that lets you offer
your own payment method *inside* the app alongside Play's, at a reduced service
fee. Needs approval; add it after launch.

**My honest advice: launch with Play Billing alone.** It is written, it is
tested by inspection, and it needs no merchant account or KYC. UPI needs a
gateway account with business documents that takes days on its own, plus a
checkout to build. Ship, take money, then add UPI.

---

## The short version

| When | What | Time |
|---|---|---|
| **Now** | Play Console signup | days–weeks of waiting |
| **Now** | `supabase login` + `db push` (step 1) | 5 min |
| **Now** | Keystore passwords from the v0.7.0 builder | minutes |
| After approval | Create the subscription + 4 base plans | 20 min |
| After approval | Service account + Pub/Sub | 30 min |
| Last | `IAP_PROVIDER: google_play`, rebuild, test | 10 min |

Real work: about two hours. The rest is Google's verification queue, which is
why step 2a should be today.
