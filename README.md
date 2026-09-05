# 🎬 Cloudlynk

**Version 1.0.0** · Built with React Native 0.85 + Expo 56 + Supabase

A production-grade video streaming and community platform — featuring Cloudflare HLS streaming, public/private channels, admin review queues, and in-app monetization.

---

## Tech Stack

| Layer       | Technology                     |
|-------------|-------------------------------|
| Framework   | React Native 0.85 + Expo 56   |
| Navigation  | Expo Router (file-based)       |
| Backend     | Supabase (Auth + DB + Storage) |
| Build/Deploy| EAS Build + EAS Submit         |
| Language    | TypeScript (strict)            |

---

## Features

- **Auth** — Email/password sign up & login, secure session management via Supabase
- **Video Streaming** — Native HLS video playback via `expo-av` backed by Cloudflare Stream
- **Channels** — Create public or private video channels; public videos go through an Admin review queue
- **Monetization** — Google Play Billing via `react-native-iap`; Premium unlocks access to specially-flagged premium content (storage stays a flat 15GB for everyone)
- **Profile** — Storage plan meter, auto-backup toggle, Wi-Fi-only uploads, and push notification toggles
- **Dark Theme** — Full dark UI, safe area aware, Android & iOS

---

## Project Structure

```
cloudlynk/
├── app/
│   ├── _layout.tsx           Root layout, auth guard
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── signup.tsx
│   └── (tabs)/
│       ├── _layout.tsx       Bottom tab bar
│       ├── index.tsx         Home dashboard
│       ├── files.tsx         File browser
│       ├── channels.tsx      Channels
│       └── profile.tsx       Profile & settings
├── lib/
│   ├── supabase.ts           Supabase client + DB types
│   ├── stream.ts             Cloudflare Stream upload & playback
│   ├── notifications.ts      Expo Push Notifications service
│   └── channels.ts           Channel operations
├── hooks/
│   ├── useAuth.ts            Session, profile state, and user roles
│   ├── useUsageTimer.ts      30-minute freemium timer
│   └── useAcquisitionSource.ts Organic vs Paid acquisition routing
├── constants/
│   └── theme.ts              Colors, spacing, typography
└── supabase/
    └── schema.sql            Full DB schema + RLS + storage
```

---

## Setup

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd cloudlynk
npm install
```

### 2. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Open **SQL Editor** → paste the contents of `supabase/schema.sql` → Run
3. Go to **Storage** → confirm the `user-files` bucket was created
4. Copy your **Project URL** and **anon/public key** from Settings → API

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

Also update `app.json` → `extra`:
```json
"extra": {
  "supabaseUrl": "https://xxxx.supabase.co",
  "supabaseAnonKey": "eyJhbGciOiJIUzI1NiIs..."
}
```

### 4. Run Locally

```bash
# Start Expo dev server
npm start

# Run on Android emulator / device
npm run android
```

---

## Play Store Build (EAS)

### Prerequisites

```bash
npm install -g eas-cli
eas login       # Log in with your Expo account
```

### One-time EAS project setup

```bash
eas build:configure
```

Update `app.json` → `extra.eas.projectId` with your EAS project ID.

### Build APK (internal testing)

```bash
eas build --platform android --profile preview
```

This produces a signed `.apk` you can install directly on any Android device.

### Build AAB (Play Store submission)

```bash
eas build --platform android --profile production
```

This produces a `.aab` (Android App Bundle) ready for Google Play.

### Submit to Play Store

```bash
# Requires google-play-key.json (service account from Google Play Console)
eas submit --platform android
```

---

## Play Store Checklist

| Item                          | Status |
|-------------------------------|--------|
| App icon (512×512 PNG)        | ☐ Add to assets/ |
| Feature graphic (1024×500)    | ☐ Upload in Play Console |
| Screenshots (phone + tablet)  | ☐ Use Expo Go or emulator |
| Short description (80 chars)  | "Secure cloud storage & community channels" |
| Full description              | See below |
| Content rating                | Teen / Medium Maturity |
| Privacy policy URL            | Required — served from `supabase/functions/legal-pages` (see `PRIVACY_POLICY_URL` in `app.json`) |
| Data safety form              | Declare: files, account info, usage data |
| Target API level              | 36 (Android 16) — required for new apps/updates by Aug 31, 2026 (Nov 1, 2026 with an extension); confirm the actual compiled level after a real build, since Expo 56's default may need to be bumped |
| Signing keystore              | Auto-managed by EAS |

### Play Store Description (copy-paste ready)

```
Cloudlynk is your personal cloud storage and creator video platform.

🎬 CLOUD STREAMING
Instantly watch curated movies, web series, and short films. Create your own channel and upload content for the world to see!

⚡ HIGH-SPEED HLS PLAYBACK
Optimized native playback engine with adaptive bitrate streaming powered by Cloudflare.

📡 COMMUNITY CHANNELS
Subscribe to your favorite creators, or become one yourself! All public content goes through an approval queue to keep the community safe.

📦 PLANS
• Free — 15 GB of personal cloud storage, access to all free content
• Premium — Same 15 GB storage, plus unlocked access to premium creator content

Developer: Cloudlynk Media
```

---

## Required Assets

Place in `assets/`:

| File                  | Size        | Notes                  |
|-----------------------|-------------|------------------------|
| `icon.png`            | 1024×1024   | App icon (no alpha)    |
| `adaptive-icon.png`   | 1024×1024   | Android adaptive icon  |
| `splash.png`          | 1242×2436   | Splash screen          |
| `favicon.png`         | 32×32       | Web only               |

Use a dark background (`#0d1117`) with the Cloudlynk cloud logo centered.

---

## Environment Variables Reference

| Variable                      | Where to get it              |
|-------------------------------|------------------------------|
| `EXPO_PUBLIC_SUPABASE_URL`    | Supabase → Settings → API    |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API  |

---

## Supabase Storage Setup

The schema automatically creates the `user-files` bucket. Verify in Supabase dashboard:

- **Bucket:** `user-files` (private)
- **Max file size:** 1 GB
- **RLS:** Users can only access `{uid}/...` paths

---

## License

Proprietary · © 2026 Cloudlynk
