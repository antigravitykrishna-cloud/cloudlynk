# Play Store Data Safety form — v0.7.0

Date: 2026-08-03
App: Streamly
Package: `com.streamly.cloud`
Version: 0.7.0 (versionCode bumped by EAS at build time)

**This doc is a pre-filled answer sheet for the Google Play Console → App content → Data safety section.** It maps every field in the form to the actual code paths and DB tables in the v0.7.0 codebase, with file:line references where it matters.

If a future version adds data collection, sharing, or a new SDK, update this doc and re-submit the Data Safety form **before** shipping that version.

---

## TL;DR (read this first)

| Question | Answer |
|---|---|
| Does the app collect or share any user data? | **Yes — collects, no sharing to third parties** |
| Is data shared with third parties? | **No** (manual admin review only; no analytics, ads, or crash-reporting SDKs in v0.7.0) |
| Is data processed ephemerally? | No — all collected data is stored in our Supabase DB / Storage. |
| Can the user request data deletion? | **Yes** — via the in-app "Delete account" flow (`app/settings/delete-account.tsx` → `supabase/functions/delete-account/index.ts`). |
| Is data encrypted in transit? | **Yes** — HTTPS only; Supabase enforces TLS, we use the `https://` endpoints. |
| Can users opt out of data collection? | **No** — to use the app at all, an account is required (auth). |

---

## Form answer sheet

The Play Console walks through three sections: **Data collection**, **Data sharing**, and **Data security & user controls**. Below are the answers for each, in the order the form asks them.

---

### Section 1: Data collection and security

#### 1.1 Does your app collect or share any of the required user data types?

**Yes.** All data is collected, none of it is shared with third parties.

#### 1.2 Is all of the user data collected by your app encrypted in transit?

**Yes.** All network calls go over HTTPS via the Supabase client (the `EXPO_PUBLIC_SUPABASE_URL` is `https://*.supabase.co`). No HTTP fallback.

#### 1.3 Do you provide a way for users to request that their data is deleted?

**Yes.** In-app "Delete account" button (Settings → Delete account) calls the `delete-account` edge function, which deletes the user's `auth.users` row (cascades to all owned rows) and the `payment-screenshots` storage folder. The `app_settings` row in `app_settings` is preserved as required.

---

### Section 2: Data types (per-category)

For each row below, the answers to "Is this collected?", "Is it shared?", "Is it required or optional?", and "Why?" are based on actual code in v0.7.0. If you change any of these, update this doc and the privacy policy.

#### Personal info

| Data type | Collected? | Shared? | Optional? | Purpose | Where it lives |
|---|---|---|---|---|---|
| **Email address** | ✅ | ❌ | ❌ Required (auth) | Account management, login | `auth.users.email` (Supabase Auth) |
| **Display name** | ✅ | ❌ | ❌ Required | App functionality, user identity | `profiles.display_name` (or `profiles.full_name` in earlier versions) |
| **User IDs** (UUID) | ✅ | ❌ | ❌ Required | Account management, RLS scoping | `auth.users.id`, foreign keys throughout schema |
| **Birth year** (added v0.8.0, migration v46) | ✅ | ❌ | ❌ Required | Age verification (18+ gate) | `profiles.birth_year` |

- **Email** is used only for auth and (in the case of admin reviewing subscription requests) for display to admins. We do not send marketing emails in v0.7.0. There is no transactional email service configured.
- **Display name** is shown next to uploads in channels. It can be changed by the user in their profile.
- **We do not collect:** name (legal first/last), phone, address, government ID, or any other PII.

#### Financial info

| Data type | Collected? | Shared? | Optional? | Purpose | Where it lives |
|---|---|---|---|---|---|
| **Payment transaction info** (UPI TRX ID + amount + plan code) | ✅ | ❌ | ✅ Optional (only if user subscribes) | Fraud prevention, account management | `subscription_requests` table |
| **Payment screenshot** (image of the UPI confirmation) | ✅ | ❌ | ✅ Optional | Fraud prevention, manual verification by admin | Storage bucket `payment-screenshots` at path `<user_id>/<timestamp>.jpg` |
| **Credit/debit card numbers** | ❌ | n/a | n/a | n/a — UPI is the only payment method; no cards | n/a |
| **Bank account** | ❌ | n/a | n/a | n/a — user pays via their own UPI app; we never see their bank account | n/a |
| **Purchase history** (in-app) | ❌ | n/a | n/a | v0.7.0 has no in-app purchase / no Play Billing. The "subscription" is a manual UPI flow. v0.7.1 will add Google Play Billing for auto-renewing subs and will need to re-submit this section. | n/a |

- **Important Play Store caveat:** because the UPI flow is a manual off-platform payment, the Play Store "Payment" section is **NOT** required — that's only for in-app purchases processed through Google Play Billing. We have no IAP in v0.7.0, so this section stays empty.
- If/when Play Billing is added in v0.7.1, this section needs to be re-done with Play Billing's data handling details, and the privacy policy needs a new section.

#### Photos and videos

| Data type | Collected? | Shared? | Optional? | Purpose | Where it lives |
|---|---|---|---|---|---|
| **Photos** (thumbnails, channel art) | ✅ | ❌ | ✅ Optional (channel owners) | App functionality, content hosting | `channel-media` bucket (public read) + `files` table |
| **Videos** (uploaded content) | ✅ | ❌ | ✅ Optional (creators) | App functionality, content hosting | Cloudflare Stream (videos themselves) + `channel_posts`/`channel_videos` metadata in Supabase |
| **Video subtitles / captions** | ✅ (schema only) | ❌ | ✅ Optional (creators) | App functionality, accessibility | `subtitles` table (created in v42 migration, UI not yet wired in v0.7.0; treat as collected-by-design for forward-compatibility) |

- Videos are uploaded via the `generate-stream-upload` edge function, which proxies to Cloudflare Stream using our account credentials. The raw video file is held by Cloudflare (their privacy policy applies to the bytes themselves); we hold the metadata (UID, duration, status).
- The `READ_MEDIA_VIDEO` / `READ_MEDIA_IMAGES` Android permissions are requested so the user can pick from their gallery when uploading. We do **not** auto-scan or auto-upload their media library.

#### Audio files

| Data type | Collected? | Shared? | Optional? | Purpose | Where it lives |
|---|---|---|---|---|---|
| **Audio** (uploaded content, recorded voice) | ✅ | ❌ | ✅ Optional (creators) | App functionality, content hosting | Same path as Videos (extracted from video uploads; we do not host standalone audio files in v0.7.0) |
| **Voice or sound recordings** (microphone) | ✅ | ❌ | ✅ Optional (creators) | App functionality, content creation | Embedded in uploaded videos; not stored separately |

- `RECORD_AUDIO` and `CAMERA` permissions are requested only when the user starts recording from within the app. They are not used for any other purpose.

#### App activity

| Data type | Collected? | Shared? | Optional? | Purpose | Where it lives |
|---|---|---|---|---|---|
| **In-app search history** | ✅ (last query, in-memory) | ❌ | n/a | App functionality (so the search modal can show recent searches) | `AsyncStorage` (client-only, not synced to server) |
| **App interactions** (what was tapped, what was played) | ✅ (limited) | ❌ | n/a | App functionality (so the user can see "Continue watching" / "Resume from N seconds") | `watch_history` table (server) + `player_prefs` (server) |
| **Other actions**: uploaded content, joined channels, sent subscription requests, admin approvals | ✅ | ❌ | n/a | App functionality, account management | corresponding tables (`channel_posts`, `channel_members`, `subscription_requests`, etc.) |

- We do **not** use third-party analytics (no Firebase Analytics, no Mixpanel, no Amplitude). The `appSettings` config in `app.json` shows blank `SENTRY_DSN` — no crash reporting SDK.
- All "in-app search history" is held client-side in `AsyncStorage` and is deleted when the user signs out or uninstalls.

#### App info and performance

| Data type | Collected? | Shared? | Optional? | Purpose | Where it lives |
|---|---|---|---|---|---|
| **Crash logs** | ❌ | n/a | n/a | n/a — no crash reporting SDK in v0.7.0 | n/a |
| **Diagnostics** | ❌ | n/a | n/a | n/a | n/a |
| **Performance data** (frame rate, load times) | ❌ | n/a | n/a | n/a — no performance monitoring SDK | n/a |

- v0.7.0 has no Sentry/Firebase Crashlytics/Bugsnag. If a crash happens, the user is expected to email `support@streamly.in` (configured in `app.json` `extra.SUPPORT_EMAIL`).
- v0.7.1: add Sentry and re-submit this section. Crash logs are server-side telemetry, not user content, so this is a small addition.

#### Device or other IDs

| Data type | Collected? | Shared? | Optional? | Purpose | Where it lives |
|---|---|---|---|---|---|
| **Device IDs** (Android ID, IMEI, MAC) | ❌ | n/a | n/a | n/a | n/a |
| **Advertising IDs** (GAID) | ❌ | n/a | n/a | n/a — no ads in v0.7.0 (AdMob IDs blank) | n/a |
| **Supabase auth session token** | ✅ (transient) | ❌ | ❌ Required | Account management | `AsyncStorage` (encrypted by Expo SecureStore on iOS; on Android it's in `AsyncStorage` — see security note below) |

- **Security note (v0.7.0):** the Supabase auth session is stored in plain `AsyncStorage` on Android, not in the Android Keystore. This is a known deviation from best practice. v0.7.1 will switch to `expo-secure-store` (already listed in the `app.json` plugins). It does NOT change the Data Safety form (the token is not "user content"), but it should be in the privacy policy's "How we protect your data" section.

#### Location

| Data type | Collected? | Shared? | Optional? | Purpose | Where it lives |
|---|---|---|---|---|---|
| **Approximate location** | ❌ | n/a | n/a | n/a | n/a |
| **Precise location** | ❌ | n/a | n/a | n/a | n/a |
| **Media location** (EXIF GPS in uploaded photos) | ⚠️ Indirectly | ❌ | ✅ Optional | The `ACCESS_MEDIA_LOCATION` permission is requested, but only when the user picks an image with location metadata. We do **not** extract or store the EXIF GPS coordinates — the location tag is included only in the bytes we upload as-is. | EXIF is in the uploaded image bytes; we do not parse it into a separate column. |

- The `READ_MEDIA_VISUAL_USER_SELECTED` permission (Android 14+) is the photo-picker scoped permission. It does not require a separate Play Store disclosure.

#### Messages

| Data type | Collected? | Shared? | Optional? | Purpose | Where it lives |
|---|---|---|---|---|---|
| **In-app messages** (chat, DMs) | ❌ | n/a | n/a | n/a — no messaging feature in v0.7.0 | n/a |
| **Push notifications** (server-sent) | ❌ | n/a | n/a | n/a — no push notification service in v0.7.0; v0.7.1 will add Expo Push for admin alerts | n/a |

#### Health and fitness, Contacts, Calendar, Files & docs, Web browsing

All **No** for v0.7.0. We do not request any of these Android permissions (`READ_CONTACTS`, `READ_CALENDAR`, `READ_CALL_LOG`, etc. are not in `app.json` `android.permissions`).

---

### Section 3: Data sharing

**No data is shared with third parties in v0.7.0.** Mark every category as "Not shared" in the form.

| Sharing question | Answer |
|---|---|
| Is any user data shared with third-party companies? | **No** |
| Is any user data shared for advertising? | **No** |
| Is any user data shared for analytics? | **No** |
| Is any user data shared for fraud prevention? | **No** (admin-only review, not a third party) |
| Is any user data shared for personalization? | **No** |
| Is any user data shared with a service provider? | **No** (Cloudflare Stream holds uploaded video bytes but acts as a data processor under our direction, not a "shared with" party in Play's sense — we still own the data and the relationship) |

- The exception: **Cloudflare Stream** processes uploaded video bytes on our behalf. This is a data-processor relationship, not a "shared with" disclosure under Play's definition. It IS a "data processor" disclosure in the privacy policy.

---

### Section 4: Data security

| Question | Answer |
|---|---|
| Is data encrypted in transit? | **Yes** (HTTPS only, no HTTP fallback) |
| Is data encrypted at rest? | **Yes** (Supabase Postgres at rest, Cloudflare Stream at rest, both provider-managed) |
| Can users request data deletion? | **Yes** (in-app "Delete account" flow, see `supabase/functions/delete-account/index.ts`) |
| Is there a way for users to opt out of personalized advertising? | **N/A** — no advertising |
| Is the app designed for children? | **No** — it requires an account and handles financial transactions; not in the "Designed for Families" program. The age gate is a user-attested birth year in the signup form (no verification). |

---

## Form walkthrough — quick answer cards

When the Play Console asks a question, here's the shortest path to the right answer:

| Play Console question | Click this |
|---|---|
| "Do you collect or share any of the required user data types?" | **Yes** |
| "Is all user data encrypted in transit?" | **Yes** |
| "Do you provide a way for users to request that their data is deleted?" | **Yes** |
| "Email address — collected?" | **Yes** |
| "Email address — shared?" | **No** |
| "Email address — required or optional?" | **Required** (for login) |
| "Email address — purpose?" | **Account management** |
| "Name — collected?" | **Yes** (display name) |
| "User IDs — collected?" | **Yes** |
| "Photos — collected?" | **Yes** |
| "Photos — shared?" | **No** |
| "Photos — required or optional?" | **Optional** |
| "Photos — purpose?" | **App functionality** |
| "Videos — collected?" | **Yes** |
| "Videos — shared?" | **No** |
| "Videos — purpose?" | **App functionality** |
| "Audio recordings — collected?" | **Yes** (only when user records) |
| "App interactions — collected?" | **Yes** |
| "App interactions — shared?" | **No** |
| "App interactions — purpose?" | **App functionality** |
| "Crash logs — collected?" | **No** |
| "Diagnostics — collected?" | **No** |
| "Device IDs — collected?" | **No** |
| "Advertising IDs — collected?" | **No** |
| "Location — collected?" | **No** (EXIF location in uploaded media is not extracted) |
| "Financial info — collected?" | **Yes** (UPI TRX ID + amount) |
| "Financial info — shared?" | **No** |
| "Financial info — purpose?" | **Fraud prevention, security, and compliance** |
| "In-app search history — collected?" | **Yes** (in-memory + AsyncStorage only) |
| "In-app search history — shared?" | **No** |
| "Sharing with third parties" section | **All categories: "Not shared"** |
| "Is your app designed for children?" | **No** |

---

## What to include in the data safety form's "Data safety explanation" free-text

> Streamly is a creator platform for video content. We collect the minimum data needed to provide the service: an email address for login, a display name for your channel, and the videos and thumbnails you choose to upload. If you subscribe to a paid plan, we collect a UPI transaction reference and a screenshot of your payment confirmation for fraud prevention — these are reviewed manually by our team and are deleted when your account is deleted. We do not use third-party analytics, advertising, or crash reporting in this version. Cloudflare Stream, Inc. processes uploaded videos on our behalf as a data processor under our direction; we do not sell or share any user data with third parties. You can request deletion of your account and all associated data at any time from the Settings screen.

---

## What this doc does NOT cover (and why)

- **iOS App Store privacy details** — v0.7.0 ships Android-only (`app.json` `ios.bundleIdentifier` is configured but the iOS build is not the v0.7.0 release target). When iOS lands, the iOS App Privacy section needs a similar mapping. Most of the same answers apply; the iOS-specific differences are: `NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription`, `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` strings in `app.json` already cover the iOS "purpose strings" — but the "App Privacy" report on App Store Connect is a separate form.
- **v0.7.1 changes** — adding Sentry, Google Play Billing, and Expo Push will require re-submitting this section. Don't ship those without updating this doc first.
- **Backend provider policies** — Supabase's privacy policy and Cloudflare's privacy policy apply to the bytes that flow through their infrastructure. The Streamly app's privacy policy (`docs/privacy-policy-outline.md`) should reference them as data processors.

---

## References

- `app.json` (the source of truth for what we declare to Play Store)
- `docs/security-audit-v0.7.0.md` (RLS/bucket audit; supports the "no sharing" claim)
- `docs/payment-flow-v0.7.0.md` (payment-screenshots bucket + subscription_requests table, both with RLS verified)
- `supabase/functions/delete-account/index.ts` (data deletion flow)
- `app/settings/delete-account.tsx` (user-facing entry point to deletion)
