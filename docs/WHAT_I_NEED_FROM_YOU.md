# What I need from you to get Cloudlynk live

You said you want **both** Play Billing and web + UPI. That is doable, and the
shape matters — see §0 before you spend money on anything.

**Never paste a secret into chat.** Every item below says exactly where to put
it instead. I only ever need to know a thing *exists*, never its value.

Ordered by what blocks what. **#1 is the long pole — start it today.**

---

## 0. Read this first: how "both" has to be shaped

Play does not let an app take payment for digital content outside Play Billing.
So "both" cannot mean two buttons side by side in the app. It means:

| Path | Where the user pays | Legal shape |
|---|---|---|
| **Play Billing** | Inside the app | Standard. Play takes 15–30%. |
| **Web + UPI** | On your website, in a browser | Fine — Play does not govern your website. **But the app may not link to it or mention it.** That is the anti-steering rule. |

The only way to offer UPI *inside* the app is **User Choice Billing**, a
separate Play Console enrolment. You can add that later; it is not a launch
blocker.

Practical consequence for your Meta ads: the web+UPI funnel has to sell
**before** the install —

```
Meta ad → landing page → UPI checkout → install app → sign in → Premium already active
```

— because once someone is inside the app, the app cannot point them at your
website to pay.

**My recommendation for speed:** ship with Play Billing only. The code is
already written. Add web+UPI as a second phase once you are live, because it
needs a merchant account with KYC that takes days on its own.

---

## 1. Google Play Console account — START TODAY

**This is the longest pole and everything else queues behind it.**

- Sign up at play.google.com/console — **$25 one-time**
- Google now requires **identity verification** for new developer accounts:
  government ID, and for an organisation account, business documents (D-U-N-S
  number for companies)
- **This takes days to a few weeks.** Nothing about it can be rushed and no
  code changes it.

Once approved, tell me and I will give you the exact product setup steps.

> One thing to go in with eyes open about: a previous account was terminated
> for this app. That history is Google's call, not something the code fixes.
> What I can do is make sure nothing in the app gives them a fresh reason —
> which is what the audits on this branch have been doing.

---

## 2. Supabase access — unblocks the critical bug

**Without this, a paid subscription can never activate.** v58 fixes a dead
PostgREST setting that silently reverts every entitlement write. It is written
and not deployed.

Pick either:

**(a) You run it** — simplest:
```bash
cd C:/Users/MIT/OneDrive/Desktop/cloudlynk
npx supabase login          # opens a browser
npx supabase link --project-ref wdtwjiixuueqejfraaod
```
Then tell me, and I will run the migration push and the verification queries.

**(b) You give me a token** — lets me do all of it:
1. supabase.com → Account → Access Tokens → Generate new token
2. In a terminal: `setx SUPABASE_ACCESS_TOKEN "<token>"`
3. Open a **new** terminal and tell me

Either way I never see your password.

### Also useful, not blocking
**Database password** (Supabase → Project Settings → Database). Needed for the
baseline migration that makes the schema reproducible — see
`supabase/BASELINE.md`. Not required to launch.

---

## 3. Release signing — required for the AAB

The AAB must be signed with a real release key or Play rejects it.

`android/app/cloudlynk-release.jks` is already on disk. **I need its passwords
put somewhere I can use without seeing them:**

Create **`C:\Users\MIT\.gradle\gradle.properties`** and put in it:

```properties
CLOUDLYNK_RELEASE_STORE_FILE=cloudlynk-release.jks
CLOUDLYNK_RELEASE_STORE_PASSWORD=<store password>
CLOUDLYNK_RELEASE_KEY_ALIAS=<alias>
CLOUDLYNK_RELEASE_KEY_PASSWORD=<key password>
```

**Not** in `android/gradle.properties` — that file is tracked by git and would
commit your passwords.

**Where to find them:** whoever built `apk/cloudlynk-v0.7.0-release.apk` had
them working. I read that APK's signing block and it is
`CN=Cloudlynk, O=Cloudlynk, C=IN` — a real release key, not the debug key. Ask
them.

**If they are genuinely lost:** a brand new keystore is fine *as long as this
app has never been published on Play*. If it has, changing the key needs a
Google-assisted reset. Tell me which and I will handle it.

---

## 4. Play Billing — after §1 approves

Once the Console account exists:

**You do, in Play Console:**
1. Upload the AAB to **Internal Testing** (products cannot be created until an
   app bundle exists)
2. **Monetize → Subscriptions → Create subscription**
   - Product ID: **`cloudlynk_premium`** — exactly this string
   - Then add **four base plans**, IDs exactly as below:

| Base plan ID | Billing period | Price | Type |
|---|---|---|---|
| `silver-7d` | 1 week | ₹199 | Auto-renewing |
| `gold-1m` | 1 month | ₹259 | Auto-renewing |
| `platinum-6m` | 6 months | ₹599 | Auto-renewing |
| `diamond-1y` | 1 year | ₹999 | Auto-renewing |

The IDs must match exactly — `lib/services/iap.ts` looks up the offer by
`basePlanId`, and a mismatch means "that base plan isn't live in Play Console
yet" at purchase time.

3. **Google Cloud Console** → create a **service account** with access to the
   Play Developer API → download its **JSON key**
4. Put that JSON where I can reference it — save it as
   `C:\Users\MIT\cloudlynk-play-service-account.json` (outside the repo) and
   tell me the path. Do not paste its contents.
5. **Play Console → Monetization setup → Licensing** — link the service account

**Then I do:**
- Set `IAP_PROVIDER: "google_play"` and verify `isIapLive()` flips
- Deploy `verify-play-receipt` with the service account as a Supabase secret
- Configure the RTDN Pub/Sub topic for `play-rtdn-webhook`
- Rewrite `terms.ts` §10 and the refund policy to match

---

## 5. Web + UPI — phase two

### Decision I need from you
**Which payment gateway?**

| Gateway | Notes |
|---|---|
| **Razorpay** | Most common in India, best docs, UPI + cards + netbanking |
| **Cashfree** | Lower fees, good UPI support |
| **PhonePe PG** | Strong UPI, narrower coverage otherwise |

A raw `upi://pay` deep link is **not** an option — that is the unverifiable
screenshot flow that contributed to the original termination. A real gateway
gives a webhook you can trust.

### What you provide
1. **Merchant account** with the chosen gateway — needs KYC: business PAN,
   bank account, often GST. **Takes several days.** Start it in parallel with §1.
2. **API key + secret** → into Supabase Edge Function secrets. Send me the
   *names* once set; I never need the values:
   ```bash
   npx supabase secrets set PAYMENT_GATEWAY_KEY_ID=... PAYMENT_GATEWAY_SECRET=...
   ```
3. **Webhook signing secret** — same place
4. **A domain** for the checkout page, or I use a Vercel subdomain
5. **Vercel account access** — you already have one for the legal pages

### What I build
- Landing page + plan selection + checkout
- Gateway integration and the redirect flow
- Webhook → verify signature → `apply_play_entitlement()` (the v58 RPC already
  exists and is the correct, safe path)
- Reconciliation for the case where the webhook is missed
- Account linking, so a purchase made before install attaches on first sign-in

---

## 6. Cloudflare — verify, probably already fine

Two things I cannot check without dashboard access:

1. **`CLOUDFLARE_STREAM_CUSTOMER_CODE`** must be set as a Supabase secret.
   Without it, **every premium video returns a 500.** Find it at Cloudflare →
   Stream; it is the `customer-<CODE>` playback subdomain.
2. The **Stream API token needs `Stream:Edit` scope** — it must both mint
   playback tokens and set `requireSignedURLs`. An upload-only token passes
   uploads and silently fails locking.

---

## 7. Store listing — small, do last

- **A support email that is actually monitored.** `app.json` says
  `support@cloudlynk.app` — confirm it exists and receives mail.
- **Grievance Officer name and address** — legally required in India under the
  DPDPA, and the privacy policy currently has a placeholder.
- **Screenshots** — I will restage them in the new navy palette; you just
  approve.
- **Feature graphic** — the current one says *"All transactions are securely
  handled through Google Play Billing."* If web+UPI ships too, that line needs
  changing. I will redo it.

---

## The short version

**Today:**
1. Start the Play Console signup (§1) — the only multi-week item
2. Start the payment gateway merchant KYC (§5) — the second-slowest
3. Ask whoever built v0.7.0 for the keystore passwords (§3)

**This week:**
4. Supabase login or token (§2) — 5 minutes, unblocks the critical entitlement bug
5. Confirm the two Cloudflare items (§6)

**Once Play Console approves:**
6. Create the subscription products (§4), and I flip Play Billing on

I can build the AAB the moment §3 lands. Everything else is about whether Play
will accept it.
