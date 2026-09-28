# Play Store listing — Cloudlynk (updated 2026-09-29)

Every sentence below matches what the app does today (v0.7.11). Google's
reviewers compare the listing with the app; anything claimed here that the app
does not do is a "misleading claims" rejection. Re-check this file whenever a
feature changes.

---

## 1. App name (30 max)

```
Cloudlynk: Cloud & Videos
```
`25/30`

## 2. Short description (80 max)

```
15 GB of private cloud storage, plus movies and series from Cloudlynk channels.
```
`79/80`

## 3. Full description (4000 max)

```
Cloudlynk is two things in one app: a private 15 GB cloud drive, and channels
of movies, series and shorts published by Cloudlynk.

15 GB OF PRIVATE STORAGE, FREE
• Back up photos, videos and documents from your phone
• Your files are private: only you can see them — nothing you upload is
  published or shared
• Organise by type and find things fast with search

CHANNELS
• Browse channels by category and join the ones you like
• Your Feed shows the newest videos from the channels you joined
• Channels and their videos are published by the Cloudlynk team

PREMIUM
Free members watch free titles. Premium unlocks titles marked Premium.
• Trial — 3 days
• Silver — 7 days
• Gold — 1 month
• Platinum — 6 months
• Diamond — 1 year
Prices are shown in the app before you pay. Premium does not change your
storage; every account keeps 15 GB.

TRY IT FIRST
Browse as a guest to see what is on Cloudlynk. Save your account with Google
or email to join channels, watch and subscribe.

SAFETY AND PRIVACY
• Cloudlynk is for adults (18+)
• Report any title from its detail page (the ⋯ menu)
• Delete your account and all your files at any time, in the app or at
  thecloudlynk.com/delete-account
```

## 4. Store settings

| Field | Value |
|---|---|
| Category | Entertainment |
| Contains ads | **No** (the ads SDK was removed in 0.7.11) |
| In-app purchases | **Yes** — Google Play subscriptions (and UPI/cards only if Play's User Choice Billing is approved) |
| Contact email | `help.cupibs@gmail.com` (must be monitored) |
| Website | `https://thecloudlynk.com` |
| Privacy policy | `https://thecloudlynk.com/privacy-policy` |
| Account deletion URL | `https://thecloudlynk.com/delete-account` |

## 5. Content rating questionnaire — answer for the ACTUAL library

| Question | Answer |
|---|---|
| User-generated content shared with others? | **No.** Only admins publish; user uploads are private. |
| Users can interact / chat? | No |
| Sexually explicit content or nudity? | Must be **No**. If any published title has it, it cannot be on Play at all (see §7). |
| Violence, drugs, profanity | Answer per the real titles in the library |
| Gambling | No |
| Digital purchases | Yes |
| Shares location | No |

## 6. App access (for the reviewer)

Create a dedicated review account (a real email you control, e.g.
`playreview@thecloudlynk.com`), save it, approve it and give it
**Lifetime** in Admin → Users. Then in Play Console → App content → App access:

```
1. Open the app and confirm 18+.
2. Tap "Continue with email", enter <review email>, and use the code
   provided below / or sign in with the password below.
3. Premium is already active on this account; every title plays.
```

Note: sign-in is Google or an emailed code. A reviewer cannot receive your
email codes — add a password sign-in for this account or give Google a
permanent way in before submitting.

## 7. Before submitting — the reviewer's checklist

- **Content:** every published title must be allowed on Google Play (no sexual
  content or nudity) and you must hold the rights to show it. Google can ask
  for proof of licence for movies and series (Intellectual Property policy).
- **Payments:** in-app, digital content must be sold through Google Play
  Billing. UPI/Razorpay/Sabpaisa may be shown **only** after Play approves
  User Choice Billing for this app, and always next to Google Play.
- **Data safety:** see `docs/play-store-data-safety.md` (email, name,
  purchase history, device IDs for Meta ads measurement, photos/videos the
  user uploads, crash data if Sentry is turned on).
- **Advertising ID:** declare "Yes" — the Meta SDK uses it for ad measurement.
- **Target audience:** 18+ only.
