# Streamly v0.6.0 — Client Demo Walkthrough

> **For the client meeting.** Complete user-facing walkthrough of the Streamly Android app.
> Read this top-to-bottom before the demo. Demo script at the bottom.

---

## 1. What is Streamly?

**Streamly** is a short-video + creator-channel platform (think YouTube Shorts + Telegram Channels, India-focused). Users can:

- Browse public content in a vertical-scroll feed (Explore tab)
- Create their own **channels**, post short videos + long-form content
- Upload files (photos, videos, documents, audio) to a personal cloud (Cloud tab)
- Subscribe to **paid plans** (Free / Standard / Gold / etc.) via UPI payment
- Watch videos streamed via Cloudflare Stream

**Tech stack:**

| Layer | Technology |
|---|---|
| Mobile | React Native + Expo SDK 53, expo-router |
| Auth + DB + Storage + Edge Functions | Supabase (Postgres + GoTrue + S3-compatible storage + Deno functions) |
| Video transcoding + playback | Cloudflare Stream (Direct Upload) |
| Payments | UPI deep links (Google Pay / PhonePe / Paytm) — manual approval flow |
| Build | EAS / local Gradle, Android-only for v0.6.0 |

**Project:** `KrishnaSmuPatel/streamly` on GitHub
**Bundle ID:** `com.streamly.app`
**App version:** 0.6.0 (versionCode 2)
**Brand:** Streamly (rebranded from Jollify, 2026-06-18). Logo B is the S-monogram with orange + green accent dots.

---

## 2. The APK

**Built APK (release-signed, ready to install):**

```
D:\Joliffy\jollify\android\app\build\outputs\apk\release\app-release.apk
```

- **Size:** 137,169,882 bytes (~131 MiB)
- **Built:** 2026-06-25 19:13 (today)
- **Signed:** Upload keystore from `android/local.properties` (production-ready)
- **Environment:** `APP_ENV=production` in `app.json extra`
- **Already installed** on the connected test device via `adb install -r`

**To install on a fresh device:**

```bash
# Phone in USB debugging mode
adb install -r "D:\Joliffy\jollify\android\app\build\outputs\apk\release\app-release.apk"
```

**To rebuild from source:**

```bash
cd D:\Joliffy\jollify\android
./gradlew clean
./gradlew assembleRelease     # APK (sideload)
# or
./gradlew bundleRelease      # AAB (Play Store submission)
```

First build takes ~14 min (downloads Gradle deps + compiles native modules). Subsequent builds: 30s–2min.

---

## 3. Account types

| Type | How to make | What they see |
|---|---|---|
| **Regular user** | Sign up via the app | Cloud, Explore, Channels (create/join), Profile |
| **Premium user** | Subscribe via UPI + admin approval | Same as regular, plus premium content + priority features |
| **Channel owner** | Create a channel | Plus Manage Channel screen, content approval workflow |
| **Admin** | `is_admin = true` in `profiles` table | Plus Admin Queue, Subscription Requests, Pending Content, Channel Activity |

**Test accounts already in the DB:**

- **`sahil@gmail.com`** — Regular user with **GOLD plan ACTIVE** (₹1,259, approved 2026-06-18). Has 1 uploaded file in Cloud. Best for client demo of My Subscription screen.
- **Admin user** — set `is_admin = true, can_upload_content = true` on your own email via:
  ```bash
  npx supabase db query --linked --output json "UPDATE profiles SET is_admin = true, can_upload_content = true WHERE email = 'YOUR_EMAIL@example.com' RETURNING id, email, is_admin;"
  ```

---

## 4. App architecture (every screen)

### 4.1 Bottom tab navigation

The app has **4 bottom tabs** (icon + label, all themed):

| Tab | Icon | Purpose |
|---|---|---|
| **CLOUD** | 📁 | Personal cloud storage (uploaded files) |
| **EXPLORE** | 🔍 | Public content discovery feed |
| **CHANNELS** | 📺 | Channel browse, create, manage |
| **PROFILE** | 👤 | User settings, subscription, account |

### 4.2 Auth flow (off the tab nav)

- **Login screen** (`app/(auth)/login.tsx`) — email + password
- **Signup screen** (`app/(auth)/signup.tsx`) — email + password + full name
- After auth → lands on Explore tab (default tab for new users)

### 4.3 Cloud tab

**Screen:** `app/(tabs)/index.tsx` (CloudScreen component)

- Top: search bar ("Search files...")
- Category chips: All / Photos / Videos / Docs / Audio
- Content area: file list with name, size, age, type badge
- Upload button → opens system file picker (Android photo/video/document picker)
- Tap a file → preview + share link (7-day expiry signed URL)

**What clients see:** "This is my personal cloud. I can upload files and share them with secure time-limited links."

### 4.4 Explore tab

**Screen:** `app/(tabs)/explore.tsx`

- Top: "Explore" header
- Horizontal category tabs: All / Popular / Most watched / Latest / Most searched
- **Shorts row** — always visible, horizontal-scroll of vertical short-form content (thumbnails are 9:16 aspect)
- Below: vertical-scroll content grid (long-form content, movies, series)
- Genre filters: Comedy / Sci-Fi / Romance / etc.

**What clients see:** "This is the discovery feed. Users find new content here. Shorts row is always visible at the top."

### 4.5 Channels tab

**Screens:** `app/(tabs)/channels/index.tsx` (list) + `app/(tabs)/channels/[id].tsx` (detail)

- **Channel list:** search bar + grid of channel cards (avatar, name, description, member count)
- **Channel detail:** banner + channel info + tabs (Posts / Videos / About) + Join button
- **Create Channel:** floating action button → modal with name + description
- **Manage Channel** (owner only): `app/channel/manage/[id].tsx` — edit channel, see members, view content stats

**What clients see:** "Users discover channels, join them, post content. Channel owners get a dashboard to manage their channel."

### 4.6 Profile tab

**Screen:** `app/(tabs)/profile.tsx`

- Top: Streamly logo + user avatar + name + email
- **Plan card:** current plan name + status badge (FREE / ACTIVE / EXPIRED) + dates
- **Storage card:** used X of Y GB
- **My Channels:** list of owned channels with status badges (Active / Pending / Suspended) + Manage button
- **Settings rows:**
  - 🔔 Notifications
  - 📊 My Subscription
  - 🎥 My Videos
  - 🌐 (Delete Account / Support)
- **Logout** button at bottom

**What clients see:** "Personal hub. Shows plan status, storage, owned channels, and quick links to settings."

### 4.7 My Subscription screen

**Screen:** `app/my-subscription.tsx`

For users with NO active subscription:
- Plan card: shows "FREE" status
- "View Plans" button → navigates to Premium screen

For users with an active subscription:
- Plan card: shows plan name + "ACTIVE" status + "Active until [date]" + "Started [date]"
- **Latest Request** card: shows the most recent subscription request
  - Plan code (e.g. GOLD)
  - Amount (e.g. ₹1,259)
  - Status (PENDING / APPROVED / REJECTED)
  - "View Screenshot" button (opens signed URL of payment proof)
  - Approval/rejection date
- "Plan Active" button at bottom

### 4.8 Premium / Plans screen

**Screen:** `app/premium.tsx`

- Lists available subscription plans from `subscription_plans` table
- Each plan card: name, price, features list, "Subscribe" button
- Tap Subscribe → opens UPI deep-link (`upi://pay?pa=streamly@upi&...`) with prefilled amount + transaction note
- After payment, user uploads screenshot back to the app (manual flow, no API integration)
- Request goes to admin queue for approval
- Admin approves → user gets plan active

**UPI integration:**
- UPI ID: `streamly@upi` (hardcoded in `lib/config.ts`)
- Merchant name: "Streamly"
- Supports all major UPI apps (Google Pay, PhonePe, Paytm, BHIM)

### 4.9 Admin screens (admin-only)

**Admin Queue:** `app/admin/pending-channels.tsx`
- Three sections: Pending Channels, Pending Videos, Pending Channel Posts
- Each item has Approve / Reject buttons
- "Play" button on video items opens signed URL preview

**Subscription Requests:** `app/admin/subscription-requests.tsx`
- Lists pending payment screenshots
- Approve / Reject with reason

**Pending Channel Content:** `app/admin/pending-channel-content.tsx`
- Channel posts awaiting approval (separate from admin queue)

**Channel Activity:** `app/admin/channel-activity.tsx`
- Stats and recent activity across all channels

### 4.10 Other screens

- **Notifications** (`app/notifications.tsx`) — notification list with read/unread state
- **My Videos** (`app/my-videos.tsx`) — videos the user uploaded via Cloudflare Stream
- **Create Content** (`app/create-content.tsx`) — flow for uploading new content
- **Export Data** (`app/export-data.tsx`) — GDPR data export
- **Delete Account** (`app/delete-account.tsx`) — account deletion with confirmation ("Type DELETE")
- **Legal:** `app/terms.tsx`, `app/privacy.tsx`, `app/refund-policy.tsx`, `app/community-guidelines.tsx`
- **App Settings** (`app/app-setting.tsx`) — app-wide preferences

---

## 5. Recommended client demo script

**Total time:** ~10 minutes
**Pre-demo setup:**
1. Phone unlocked, on home screen
2. Streamly APK already installed (verify by tapping app icon → lands on Explore)
3. Signed in as `sahil@gmail.com` (regular user with GOLD plan)
4. Have admin credentials ready to switch to (your own account with `is_admin=true`)

### Demo flow (in order):

| # | Action | What to highlight |
|---|---|---|
| **1** | Open Streamly app | "Dark theme, Streamly branding, custom icons. Built with React Native + Expo." |
| **2** | Tap **Cloud** tab | "Personal cloud storage. Users upload photos, videos, docs, audio." |
| **3** | Show the file `1000265202.jpg` in the list | "Each file has name, size, age. Storage usage shown in Profile." |
| **4** | Tap **Explore** tab | "Public content feed. Shorts row always visible at the top for short-form discovery." |
| **5** | Scroll Explore, show category tabs | "Categorized: All, Popular, Most watched, Latest, Most searched. Genre filters below." |
| **6** | Tap **Channels** tab | "Discover and join channels. Users create their own channels for niche content." |
| **7** | Tap a channel | "Channel detail page. Posts, videos, member count, join button." |
| **8** | Tap **Profile** tab | "Personal hub. Storage usage, plan status, owned channels, settings." |
| **9** | Tap **My Subscription** | **⭐ KILLER DEMO** — "Active GOLD plan, ₹1,259, approved by admin. Full paywall flow: user requested → paid via UPI → uploaded screenshot → admin approved → plan active." |
| **10** | Tap "View Screenshot" | "Opens signed URL of payment proof. 1-hour expiry." |
| **11** | Back, tap **Logout** | "Secure sign-out." |
| **12** | Sign in as **admin user** | Switch accounts to show admin capabilities. |
| **13** | Tap Profile → **Admin Queue** | "Admin reviews pending channels, videos, posts. Approve/Reject with one tap." |
| **14** | Tap **Subscription Requests** | "Admin sees payment screenshots awaiting verification." |
| **15** | Wrap up | "Storage is Supabase + S3-compatible. Videos transcoded by Cloudflare Stream. Payments via UPI manual approval. Full source in the repo, ready for Play Store submission." |

### If the client asks specific questions:

| Question | Answer |
|---|---|
| "Is this real or a demo?" | "This is the production app. The seeded content (sample channels + shorts) gives the feed visual weight so you can see how it feels with real content. We can wipe it anytime." |
| "How do users pay?" | "UPI deep links — works with all major Indian UPI apps. User pays externally, uploads screenshot back, admin approves." |
| "Is there iOS?" | "Not yet. The codebase is React Native + Expo so iOS is straightforward. Android-first for v0.6.0 to validate the Indian market." |
| "Where is data stored?" | "Supabase Postgres (user data, channels, posts) + Supabase Storage (files, thumbnails, payment screenshots) + Cloudflare Stream (videos, transcoded + CDN'd)." |
| "Can I see the code?" | "Yes — `KrishnaSmuPatel/streamly` repo. ~12k lines of TypeScript across app/, lib/, components/, plus Supabase migrations in `supabase/migrations/`." |
| "What's the timeline to Play Store?" | "Once we have the Play Store service account JSON + AdMob creds + Firebase project + Sentry DSN, submission takes ~1 day. App is ready." |

---

## 6. Known issues / honest disclosures

These are things the client might notice. **Be upfront if asked:**

1. **Sample content in the feed.** 17 posts have `picsum.photos` placeholder thumbnails (10 "shorts" + 7 long-form). This is intentional seed data so the Explore tab has visual weight. The DB can be wiped anytime.

2. **UPI payment is manual.** No integration with UPI APIs. Users pay externally via their UPI app, then upload a screenshot back to Streamly. Admin manually approves. This is by design — auto-detection of UPI payments requires vendor partnerships.

3. **AdMob not configured.** `app.json` has `ADMOB_APP_ID: ""`. Ads aren't shown. Needs real AdMob creds to enable.

4. **Sentry not configured.** No crash reporting. Needs Sentry DSN.

5. **No Play Store listing assets yet.** App icon is built but needs designer polish for Play Store (512×512 icon + 1024×500 feature graphic).

6. **Privacy policy URL is a placeholder.** Currently points to `https://streamly.in/privacy` which doesn't exist yet. Needs to be hosted before Play Store submission (data safety form requires it).

---

## 7. If something breaks during the demo

**App crash:**
1. Note the flow + screen
2. Re-launch from launcher
3. If persistent, `adb uninstall com.streamly.app` then `adb install -r app-release.apk`
4. Worst case: rebuild takes 15 min

**Specific UI looks wrong:**
1. Take a screenshot (`adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png`)
2. Share with dev team
3. Fix forward — don't break the demo trying to fix live

**Network issue:**
1. Check WiFi/data on phone
2. Streamly uses Supabase (DB + auth + storage) — needs internet
3. UPI requires data or WiFi for the deep-link to work

---

**Generated:** 2026-06-25
**App version:** 0.6.0 (versionCode 2)
**APK SHA:** (run `certutil -hashfile app-release.apk SHA256` to get)
**Project:** KrishnaSmuPatel/streamly
