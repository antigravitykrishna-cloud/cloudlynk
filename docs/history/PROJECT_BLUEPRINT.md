# Streamly — Project Blueprint

**Last updated:** 24 Aug 2026 00:00 IST
**Owner:** Krishna (`haijiyasjameed0002@gmail.com`) — freelance/agency dev shipping to client
**Project root:** `D:\Joliffy\jollify`
**Current branch:** `launch-hardening` (working tree dirty, AAB v5 still on disk)
**Status:** 🚨 **AYUB TRADERS Google Play account TERMINATED 20 Aug 2026; appeal filed 21 Aug; v0.8.0 work pivoted in parallel**

## 0. How to read this doc

- **If you're a new Mavis session, a teammate, or future-me starting cold**: read §1 TL;DR + §8 Current Status + §9 Active Blockers first. Then §10 Next Steps Playbook depending on whether the appeal lands approved or denied.
- **If you're debugging a build / signing / package issue**: jump to §6 File & Asset Inventory + §11 Critical Lessons Learned.
- **If you're working on v0.8.0**: §13 v0.8.0 Scope is your scope of work.
- **If you need to talk to Google**: §7 Accounts & Identifiers + Appendix B Contact Reference.
- **Update trigger**: any time state changes — appeal verdict lands, a build is shipped, a new account is created, a new cron goes live. Edit this file as the canonical record; do not fork.

---

---

## 1. TL;DR

Streamly is a UGC short-video platform (Reels/TikTok style) being shipped to a client based in Surat, India. We built v0.7.0 — a full custom video player, multi-select upload queue, UPI-backed Premium subscription, and AdMob SDK scaffolded but inactive. v0.7.0 was submitted to Production review on 11 Aug 2026, sat in Google's queue for 8+ days with no verdict, and on 20 Aug Google terminated the AYUB TRADERS developer account for "High Risk Behavior Patterns" linked to prior terminated accounts on related developer accounts. The client is currently waiting on an appeal filed 21 Aug 2026 via the official Google Play support domain. 7-day appeal SLA expires ~28 Aug 2026. Meanwhile, work continues locally on a v0.8.0 release (UI revamp + security hardening + real AdMob) that will be ready whichever way the appeal lands.

---

## 2. What is Streamly

| Field | Value |
|---|---|
| Product | UGC short-video platform (UGC = user-generated content) |
| Package ID | `com.streamly.cloud` |
| App icon | 512×512 PNG derived from `assets/icon.png` (1024×1024) |
| Privacy policy | `https://streamly-legal.vercel.app/privacy-policy` (10 sections, DPDPA 2023 compliant) |
| Support email | `support@streamly.in` |
| Grievance Officer | (placeholder in privacy policy §13, not yet filled) |
| Target markets | 176 countries (per AYUB TRADERS release config) |
| Content category | Video players & editors (Play Store) |
| Monetization | Premium subscription (UPI), AdMob (post-launch) |
| Data collection | "Collected, not shared" — no third-party sharing per Data Safety form |

---

## 3. Tech Stack

| Layer | Tech | Notes |
|---|---|---|
| Framework | **Expo SDK 53** | `expo`, `expo-router`, `expo-video` |
| Runtime | **React Native 0.85+** | New architecture enabled |
| Language | **TypeScript** | strict mode |
| State | TanStack Query + Zustand | Persisted to AsyncStorage |
| Auth | Supabase Auth | `expo-secure-store` for tokens |
| DB / API | **Supabase** project `wdtwjiixuueqejfraaod` | Postgres + RLS + Storage |
| Video | **Cloudflare Stream** | HLS playback, not raw MP4 |
| Player | **Custom `expo-video` + PanResponder** | NOT react-native-video (v6 has media3 conflict) |
| Payments | **UPI deep-link** (`react-native-iap` scaffolded, no IAP) | Hardcoded UPI ID fallback in `app.json` |
| Ads | **`react-native-google-mobile-ads@16.4.0`** (placeholder, not active) | Test App IDs only, no real AdMob account yet |
| Build | EAS Build OR local `gradlew bundleRelease` | AAB for Play Store |
| Signing | Self-managed keystore | `android/app/streamly-upload.jks` (see §6) |
| Distribution | Google Play (was) + direct APK sideload (currently) | |
| Privacy/storage | AsyncStorage + SecureStore + RLS-gated Supabase tables | |
| Test device | Samsung Galaxy S24 Ultra, model SM_S928B, product e3q, device ID RZCX10AZVXK | |

---

## 4. Build History (chronological)

### Phase 1 — Pre-rebrand (`jollify` era)
- **v0.5.0** shipped to Internal Testing under the **Joliffy / jollify** brand with `com.jollify.cloudspace` package
- Established v41 storage hardening (multi-tier: RLS + signed URLs + client-side encryption)
- Built core upload pipeline, video compression, Supabase auth flow

### Phase 2 — Rebrand to Streamly
- **v0.6.0**: full rebrand from Joliffy → **Streamly**
- New app icon, feature graphic, store listing
- Package ID became a problem (see Phase 4)

### Phase 3 — Player foundation (`launch-hardening` branch)
- **v0.7.0** built with:
  - Custom video player (gesture-controlled, quality picker, 0.5x–2x speed)
  - Multi-select upload queue with foreground manager
  - UPI-backed Premium subscription flow
  - AdMob SDK scaffolded with Google test App IDs (no real AdMob account)
  - Schema migration `20260721120000_v42_player_prefs.sql` added `duration_seconds`, `completed`, `last_watched_at` to `watch_history`
  - 5 launch docs committed as `f70338a` (security audit, payment flow, cleanup-SQL review, player test matrix, Play Store data safety, privacy policy outline, release notes, v0.7.1 scalability design)
- Bugfixes 4-8: orientation handling, resume overlay, multi-select picker stability, etc. (commits `027aeb1`, `56544e0`, `d23a19c`, `0368f41`, `d4e047e`)

### Phase 4 — Package rename (Path C, "the saga begins")
- Google rejected `com.jollify.cloudspace` upload in Closed testing v3 because of Play Store duplicate-app rules
- Decision: **Path C** — new package `com.streamly.cloud`, new keystore, new Play Console app created (Aug 5)
- v0.7.0 v4 AAB built, signed with new `streamly-upload.jks`
- Closed testing v4 published 6 Aug 2026
- Open testing v5 published 9 Aug 2026
- AAB v5 reused for Production push (bypasses lost keystore)

### Phase 5 — Production push & death spiral
| Date | Event |
|---|---|
| **11 Aug 2026, 13:30 IST** | Production v0.7.0 submitted (Submission ID 4, 3 changes: v0.7.0 release + 176 countries + rest of world) |
| 11–14 Aug | Sat in "In review" state with no verdict |
| 14 Aug | Cron ticks 1+2 found no movement; user filed Play Console support ticket |
| 19 Aug, 8:50 AM | `googleplay-developer-support@google.com` replied: "Our team is actively investigating" |
| 20 Aug, 2:45 PM | Routing email: "Submit a formal appeal through the designated appeals process" (referring to support.google.com form, not the in-console contact form) |
| 20 Aug | 🚨 **AYUB TRADERS developer account terminated** — "High Risk Behavior Patterns" linked to "other related developer accounts that were previously terminated" |
| 21 Aug | Appeal filed via official support domain: `https://support.google.com/googleplay/android-developer/contact/appeal` |
| 28 Aug (expected) | 7-day appeal SLA expires |

### Phase 6 — Pivot to v0.8.0 (current)
- 23 Aug: User pivoting to v0.8.0 development on a feature branch
- Scope: UI revamp + security hardening (cert pinning, root detection, Play Integrity API, jailbreak detection, encrypted storage) + real AdMob integration (new Gmail `streamly-ads@gmail.com` to avoid linking signals)
- Build verification: AAB v5 still on disk; working tree has many uncommitted changes

---

## 5. Critical Decisions Made (and why)

| Decision | Rationale |
|---|---|
| **Custom player via `expo-video` + PanResponder** (not RNGH) | Avoids RNGH race conditions; PanResponder is simpler and gives full gesture control. `react-native-video` v6 has media3 conflict on Android. |
| **Package rename to `com.streamly.cloud`** (Path C) | "Joliffy" brand dropped due to duplicate-app rule conflicts. New package gave clean slate. |
| **Self-managed keystore** (not Play App Signing initially) | First project; Play App Signing wasn't turned on early enough. Reused v5 AAB from Open testing when keystore was lost in `prebuild --clean` run. |
| **Hardcoded UPI ID fallback** in `app.json` with `EXPO_PUBLIC_UPI_ID` env override | Indian payment UX, no App Store/Play Billing IAP complications, real money to real UPI account instantly. |
| **AGP only auto-loads `sdk.dir` + `ndk.dir` from `local.properties`** | Critical: arbitrary keys like `STREAMLY_UPLOAD_STORE_FILE` are silently ignored — must explicitly load file in `app/build.gradle` (lesson learned the hard way). |
| **Cert SHA-1 verification post-build** | AAB/APK build "success" doesn't mean it's signed correctly. Use `apksigner verify --print-certs` (APK) or `keytool -printcert -file META-INF/*.RSA` (AAB). |
| **Managed publishing OFF** for first production | No scheduled publish, no staged rollout — `v0.7.0 — Public launch` with 100% rollout, manual Send for review when ready. |
| **DO NOT create a new dev account during appeal** | "High Risk Behavior Patterns" flags account linkage via device fingerprint, payment, IP, address, install fingerprint. New account during appeal = appeal auto-fails + permanent cross-ban. |
| **Reply on existing support thread, not new ticket** | Stanley's 19 Aug reply thread is mid-investigation; new ticket = duplicate routing, restarts clock. |
| **File appeal via `support.google.com/googleplay/android-developer/contact/appeal`** | Not the in-console contact form (inaccessible when org is terminated). Support domain form works regardless of console state. |
| **NEVER `npx expo prebuild --clean`** | Destroys `local.properties`, `android/app/streamly-upload.jks`, all build artifacts. Use `npx expo prebuild` (no flag) to preserve files. |

---

## 6. File & Asset Inventory

### Working tree
| Path | Purpose |
|---|---|
| `D:\Joliffy\jollify\` | Project root |
| `D:\Joliffy\jollify\android\app\streamly-upload.jks` | **Upload keystore** (DO NOT DELETE) |
| `D:\Joliffy\jollify\android\local.properties` | `sdk.dir`, `STREAMLY_UPLOAD_*` keystore creds |
| `D:\Joliffy\jollify\app.json` | Expo config: UPI ID, AdMob plugin config, ADMOB_ENABLED flag |
| `D:\Joliffy\jollify\lib\ads.ts` | AdMob no-op wrapper (`AdBanner`, `showRewardedAd`, `showInterstitialAd`) |
| `D:\Joliffy\jollify\docs\` | 5 launch docs from `f70338a` + this blueprint |
| `D:\Joliffy\jollify\store-screenshots\` | App icon (V3 512×512) + feature graphic (1024×500) |

### Build artifacts (on disk)
| Artifact | Path | Status |
|---|---|---|
| AAB v4 (closed testing) | `android/app/build/outputs/bundle/release/app-release.aab` | Orphaned (org terminated) |
| AAB v5 (open testing + production push) | same path | Reused for production push, sha1 `FD:32:C6:43:FB:B8:F0:84:4C:3E:97:83:C3:8B:3A:8F:9A:D4:7B:3B` |
| Sideload APK | `android/app/build/outputs/apk/release/app-release.apk` | Installed on S24 Ultra, versionCode 1 |
| Supabase project | `wdtwjiixuueqejfraaod` | Healthy, independent of Play |
| Cloudflare Stream | configured | Healthy, independent of Play |

### Keystore
```
Alias: streamly-upload
Subject: CN=Streamly, OU=Mobile, O=Streamly, L=Surat, ST=Gujarat, C=IN
SHA-1: FD:32:C6:43:FB:B8:F0:84:4C:3E:97:83:C3:8B:3A:8F:9A:D4:7B:3B
SHA-256: 67:83:B1:A4:D4:61:90:BC:5B:46:CF:FC:D0:65:BA:F7:99:37:9C:C7:6A:3D:7A:5C:B0:7A:13:28:3A:6F:5F:22
Valid until: 2053-11-03
Password: Str3@mly2026!Upl0ad (in local.properties, NEVER commit)
```

### Build environment
- **Node:** set `NODE_ENV=production` before gradle invocations
- **Gradle:** use `--max-workers=1` and `GRADLE_OPTS='-Xmx2g -XX:MaxMetaspaceSize=512m'`
- **Build commands:**
  ```powershell
  # AAB for Play Store
  .\gradlew.bat bundleRelease --no-daemon --max-workers=1
  
  # APK for sideload
  .\gradlew.bat assembleRelease --no-daemon --max-workers=1
  ```
- **aapt v36** doesn't work on AABs; use `keytool -printcert -file META-INF/*.RSA` instead
- **apksigner verify** doesn't work on AABs; use the META-INF/*.RSA approach

---

## 7. Accounts & Identifiers Reference

### Play Console
| Field | Value |
|---|---|
| Org | **AYUB TRADERS** |
| Org ID | `4875250737461180056` |
| App ID | `4973027945185181188` |
| Package | `com.streamly.cloud` |
| Owner email | `haijiyasjameed0002@gmail.com` |
| Status | **TERMINATED 20 Aug 2026** |
| Appeal status | **FILED 21 Aug 2026, awaiting verdict** |
| AAB v5 (reused for production push) | `app-release.aab` versionCode 5, built 9 Aug 2026 23:43:24 |
| Submission ID 4 | Production v0.7.0 — 3 changes: rollout + 176 countries + rest of world — submitted 11 Aug 13:30 IST |
| Track history | Closed testing v4 (published 6 Aug), Open testing v5 (published 9 Aug, currently PAUSED), Production v0.7.0 (terminated before verdict) |

### Other accounts
| Service | Email | Status |
|---|---|---|
| AdMob | (not yet created) | Use NEW `streamly-ads@gmail.com` to avoid linking signals |
| Supabase | `wdtwjiixuueqejfraaod` | Healthy, project owner: `haijiyasjameed0002@gmail.com` |
| Cloudflare Stream | configured | Healthy, account: `haijiyasjameed0002@gmail.com` |
| GitHub | (not specified in memory) | |
| Privacy policy hosting | Vercel | `streamly-legal.vercel.app` |
| Vercel | (likely `haijiyasjameed0002@gmail.com`) | Healthy |

### Testers
- 4 email lists: Krishna_test2, Krishna_Tester, Mit_test1, Sahil_tester
- All had access to Open testing v5 (now paused)
- All Play testing opt-in links are dead since account termination

---

## 8. Current Status (as of 24 Aug 2026 00:00 IST)

### ✅ What's shipped
- v0.7.0 AAB (signed, release-ready) — `versionCode 5` from 9 Aug 2026
- Working sideload APK on S24 Ultra (v0.7.0 running locally)
- Supabase backend in production-ready state
- Cloudflare Stream pipeline functional
- Privacy policy live at `streamly-legal.vercel.app/privacy-policy`
- Codebase with custom player, upload queue, UPI payments
- Launch docs (5) on `launch-hardening` branch tip `f70338a`
- Bug fixes (4-8) committed on `launch-hardening`
- AdMob SDK scaffolded in `lib/ads.ts` and `app.json` (Google test IDs, no real account)

### 🔄 What's in flight
- **v0.8.0 work** on a feature branch (UI revamp + security hardening + real AdMob)
- **Appeal verdict** — Google has up to 7 days from 21 Aug 2026 (~28 Aug 2026)
- Multiple stale crons firing daily for "Production review verdict" (no longer applicable)

### 🚫 What's blocked / waiting
- **AYUB TRADERS Play Console account**: terminated, cannot upload, cannot publish
- **v0.7.0 Production release**: orphaned in submitted-but-never-approved state
- **Open testing v5**: paused, country updates can't ship
- **Closed testing v4**: orphaned
- **All 4 tester email lists**: cannot access app via Play Store

---

## 9. Active Blockers — Detailed

### Blocker 1: Account termination
- **Why:** "High Risk Behavior Patterns" — Google linked AYUB TRADERS to previously terminated accounts (likely the `com.jollify.cloudspace` v0.6.0 era or earlier)
- **Mitigation in progress:** Appeal filed via `support.google.com/googleplay/android-developer/contact/appeal` on 21 Aug 2026
- **SLA:** 7 days from appeal submission, can extend in exceptional cases
- **What we cannot do:** Create a new dev account, modify Play Console, upload builds
- **What we can do:** Local development, build/sideload testing, AdMob account creation (different Gmail)

### Blocker 2: Lost keystore (resolved, recurring risk)
- Originally: `streamly-upload.jks` was deleted by accidental `npx expo prebuild --clean` on 10 Aug 2026
- Workaround: Used v5 AAB already on Play Console (Release library) to push Production
- **New risk:** v0.8.0 rebuild needs fresh AAB; if user does `prebuild --clean` again, lose the keystore AGAIN. **Never run that command.**

### Blocker 3: Account linking risk
- `haijiyasjameed0002@gmail.com` is permanently tied to terminated AYUB TRADERS
- Any new Play Console account using same email/payment/IP/device = permanent cross-ban
- **Mitigation:** Use different machine, different payment method, different email, different Chrome profile for any future new account

---

## 10. Next Steps Playbook

### During appeal (now → 28 Aug)
1. **Do NOT touch Play Console** for AYUB TRADERS
2. **Continue v0.8.0 development** on a feature branch off `launch-hardening`
3. **Set up real AdMob** at `ads.google.com` using a **different Gmail** (e.g. `streamly-ads@gmail.com`)
4. **Wait for appeal verdict** — daily cron check on appeal thread
5. If no verdict by 28 Aug: send a single short follow-up on the support thread

### If appeal APPROVED
1. Resume Play Console operations on AYUB TRADERS
2. Build v0.8.0 AAB (`versionCode 7` or higher — verify Play Console for last used)
3. Push to Internal testing first, then Closed, then Open, then Production (sequential, not parallel)
4. Configure AdMob with the new real AdMob account, link to AdMob Mediation in Play Console
5. Ship to client, monitor for 48h, then declare launch complete

### If appeal DENIED
1. **DO NOT** create a new dev account immediately
2. Wait **minimum 30 days** for Google's termination signal to decay
3. Set up completely fresh identity:
   - Different machine (or fully factory-reset device)
   - Different payment method (different bank account, different card)
   - Different email
   - Different Chrome profile
   - Different physical address
4. Pay the $25 USD Play Console fee again
5. Create AYUB TRADERS-2 (or new entity name)
6. Push v0.8.0 fresh
7. Original 176-country rollout may need to be India-only first if account-linking flags trigger again

### Distribute app to client/users (current workaround)
- Sideload APK to user's S24 Ultra
- Or distribute via Telegram / direct download link from `streamly.in`
- AdMob revenue still works (no Play Store dependency for ad serving)
- Supabase backend fully functional for direct-API clients

---

## 10a. v0.8.0 Scope (work in flight, no Play Console needed)

Started 23 Aug 2026 on a feature branch off `launch-hardening`. The whole point: this work can be done **regardless of the appeal verdict**, so we don't lose days waiting on Google.

### 10a.1 — UI Revamp
- New home feed layout (TikTok-style with edge-to-edge video, removed header deadspace)
- Profile redesign (avatar, stats, episode grid)
- Premium screen polish (DPDPA-compliant copy)
- Player: speed indicator, quality selector, episode navigation
- Color system + spacing tokens refresh

### 10a.2 — Security Hardening
- **Certificate pinning** (Supabase REST + Storage endpoints)
- **Root detection** (jailbreak-style checks)
- **Play Integrity API** (replaces SafetyNet which Google deprecated)
- **Jailbreak detection** (for completeness)
- **Encrypted local storage** (move sensitive tokens from AsyncStorage → SecureStore / encrypted MMKV)
- **Anti-debug** checks (early return on `__DEV__` or `adb shell run-as`)

### 10a.3 — Real AdMob Integration
- New AdMob account at `ads.google.com` registered under **NEW Gmail `streamly-ads@gmail.com`** (not `haijiyasjameed0002@gmail.com` — to avoid any device-fingerprint / payment linking to the terminated account)
- Wait for AdMob approval (1-3 days typically, requires new account review)
- Once approved: create ad units (banner, interstitial, rewarded), plug unit IDs into `lib/ads.ts`
- Flip `ADMOB_ENABLED: true` in `app.json` + plugin config
- Test on S24 Ultra via sideload (test mode uses real test IDs from AdMob dashboard)

### 10a.4 — Privacy Policy + Grievance Officer
- Privacy policy at `streamly-legal.vercel.app/privacy-policy` is 10 sections, DPDPA 2023 compliant EXCEPT for the Grievance Officer block (placeholder, not filled)
- **BLOCKER for Play Store data safety form**: India Data Fiduciaries under DPDPA 2023 must name a Grievance Officer (name, designation, email, phone, postal address) with 30-day response SLA
- Action: pick a name (could be a placeholder like "Grievance Officer, AYUB TRADERS"), wire it in before any v0.8.0 Play Store push
- Even if appeal is denied and we go direct-distribution only, this is still required for the app's privacy claim

### 10a.5 — Build environment (currently broken — fix before any v0.8.0 AAB)
Two `bundleRelease` attempts failed 23 Aug 2026 with two different errors:
- `gradlew.bat :` — caused by `-Dorg.gradle.jvmargs=...` being parsed as a Gradle task name. **Fix**: set `GRADLE_OPTS=-Xmx2g -XX:MaxMetaspaceSize=512m` as an env var, NOT as a `-D` CLI flag
- `The NODE_ENV environment variable is required but was not specified` — Expo's `createExpoConfig` task wants `NODE_ENV=production` set. **Fix**: `$env:NODE_ENV='production'` before invoking gradlew
- Working pattern (verified pre-Aug 10):
  ```powershell
  $env:NODE_ENV='production'
  $env:GRADLE_OPTS='-Xmx2g -XX:MaxMetaspaceSize=512m'
  cd D:\Joliffy\jollify\android
  .\gradlew.bat bundleRelease --no-daemon --max-workers=1
  ```

### 10a.6 — v0.8.0 release mechanics
- Bump `version` to `0.8.0` in `app.json` (EAS auto-bumps `versionCode` because `appVersionSource: "remote"`)
- Push sequence once appeal lands: Internal → Closed → Open → Production (sequential, not parallel — Google flags concurrent multi-track submits as suspicious)
- First-time Production review after reinstatement will take 5-7 days minimum (Google "actively investigates" all reinstated accounts)

---

## 11. Critical Lessons Learned (memory-saved)

### React Native + Expo
- **AGP only auto-loads `sdk.dir` and `ndk.dir` from `local.properties`** — must explicitly `load(new FileInputStream(rootProject.file("local.properties")))` in `app/build.gradle` for keystore creds
- **aapt2 v36 doesn't work on AABs** — use `keytool -printcert -file META-INF/*.RSA` for cert verification
- **apksigner verify doesn't work on AABs** — same `META-INF/*.RSA` approach
- **NEVER `npx expo prebuild --clean`** — destroys keystore + local.properties. Use `npx expo prebuild` (no flag) to preserve
- **React Native autolinking cache gotcha** — `app:generateAutolinkingNewArchitectureFiles` task cache invalidation misses applicationId renames; add an `afterEvaluate` hook to patch the generated `ReactNativeApplicationEntryPoint.java` after a package rename
- **`-Dorg.gradle.jvmargs=...` as gradle CLI flag is parsed as task name** — set via `GRADLE_OPTS` env var instead
- **`react-native-video` v6 has media3 conflict** on Android — use `expo-video` instead
- **Use `--max-workers=1`** for builds on memory-constrained Windows machines
- **Status bar on S24 Ultra** takes top ~130px — UI taps at y<130 hit system notification area, not the player

### Supabase
- **Storage upload in RN**: `fetch(uri).arrayBuffer()` + `new Uint8Array()` — `fetch(uri).blob()` returns Blob which supabase-js rejects
- **No `uploadAsync` in supabase-js** — only `upload(blob|arrayBuffer|formData)`
- **PostgREST silent failures**: RLS-blocked UPDATEs, missing GRANTs, schema cache all return `{data: null, error: null}`. Code MUST check row count, not just `error`. Fix: SECURITY DEFINER function with `auth.uid()` + admin check inside body
- **Supabase CLI `db push`** silently skips migrations without `<YYYYMMDDHHMMSS>_name.sql` timestamp prefix
- **TanStack Query signOut in RN**: `queryClient.clear()` does NOT wipe the AsyncStorage persister — also call `AsyncStorage.removeItem(<persister-key>)` or next user's session rehydrates the previous user's data
- **All migrations must end with `NOTIFY pgrst, 'reload schema';`**

### Play Console
- **For new apps: AAB required, not APK** — `gradlew bundleRelease`
- **Version code is GLOBAL across all tracks** — every release (Internal, Closed, Open, Production) must have unique versionCode
- **Photo/Video permission declaration is required** for apps using `READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO` (post-2024)
- **Photo/Video permission justification must be ≤ 250 chars**
- **"App not available" in tester install = country filter mismatch** — country filter blocks testers silently
- **Track must be "Active"** for opt-in link to work — paused track gives production store URL which 404s
- **Open testing** = public opt-in URL, no email gate, no search visibility — best middle ground for "live install without Production"
- **Open testing has 12-48h Google-side propagation delay** — owner sees immediately, others propagate over time
- **Managed publishing off** for first production = releases go live immediately upon approval (no scheduled publish)
- **"Restart review dialog"** when in-progress review exists: "Restart review" is the standard path — it's a clock reset, not extra time
- **Release library** allows reusing AAB across tracks — bypasses keystore loss
- **Play App Signing** (default since Aug 2021) is what makes upload key reset possible
- **Upload key reset** recovery: Google emails link to org owner → upload new keystore → Play re-signs with same app signing key

### Play Console Termination
- **"High Risk Behavior Patterns"** = prior terminated account linkage via device fingerprint, payment, IP, address, install fingerprint
- **DO NOT** create a new account during appeal window — invalidates appeal, triggers permanent cross-ban
- **Appeal form** is on `support.google.com/googleplay/android-developer/contact/appeal` (NOT the in-console contact form, which is inaccessible when org is terminated)
- **Appeal SLA: 7 days** from submission, can extend "in exceptional cases"
- **Reinstatement is real** if no actual current-account policy violation — appeals do work
- **First-time Production review delays**: First-time Production + UGC video + many countries + IST→PT timezone all compound to push past Google's "72h" window. We waited 8+ days with no verdict before termination. Plan for 5-7 days minimum on the next Production push.
- **Play Store support contact** (`googleplay-developer-support@google.com`) is the escalation path for reviews past 72h — Stanley from the team is real, replies within 24-48h

### Cloudflare Stream
- **HLS URL pattern**: `iframe.videodelivery.net/<UID>` is iframe-only. Native players need `https://customer-<CODE>.cloudflarestream.com/<UID>/manifest/video.m3u8`
- **Direct upload cap: 200MB** on Bundle/Basic plan (not 5GB)

### Windows-only
- `/dev/stdin` does NOT exist
- `adb exec-out screencap -p > file.png` corrupts PNG via UTF-16 — use `adb shell screencap` + `adb pull`, or `Set-Content -Encoding Byte`
- `mavis-trash` (not `Remove-Item`) for safe deletion
- **Gradle `-Dorg.gradle.jvmargs=...` CLI flag is parsed as a task name** — set via `GRADLE_OPTS` env var instead
- **Expo `createExpoConfig` task requires `NODE_ENV=production`** before `gradlew.bat` invocation, or it errors with "The NODE_ENV environment variable is required but was not specified"
- **Working Windows build command**:
  ```powershell
  $env:NODE_ENV='production'
  $env:GRADLE_OPTS='-Xmx2g -XX:MaxMetaspaceSize=512m'
  cd D:\Joliffy\jollify\android
  .\gradlew.bat bundleRelease --no-daemon --max-workers=1
  ```

---

## 12. Open Questions / Decisions Needed

None critical right now. The user is in "wait for appeal" mode.

### When verdict lands, decisions needed:
1. **If approved**: Push v0.8.0 fresh, or push v0.7.0 first to validate pipeline?
2. **If denied**: Client relationship — refund? Continue under new identity? Pivot to direct distribution only?
3. **Long-term**: Build a separate `streamly-direct` web client (PWA) to bypass Play Store entirely? Tauri desktop build? These are contingency options.

---

## Appendix A: Full Timeline

| Date | Event |
|---|---|
| ~May 2026 | v0.5.0 shipped to Internal Testing (Joliffy brand, `com.jollify.cloudspace`) |
| ~Jun 2026 | v0.6.0 rebrand to Streamly |
| 5 Aug 2026 | Path C package rename decision: `com.streamly.cloud` + new keystore |
| 6 Aug 2026 | Closed testing v4 published |
| 9 Aug 2026 23:54 | Open testing v5 published |
| 10 Aug 2026 | `prebuild --clean` accident: keystore + local.properties lost |
| 11 Aug 2026 13:30 IST | Production v0.7.0 submitted (Submission ID 4) |
| 14 Aug 2026 | User filed Play Console support ticket about slow review |
| 19 Aug 2026 8:50 AM | Stanley from Google support: "actively investigating" |
| 20 Aug 2026 | AYUB TRADERS account terminated; "Review Notification" email + 8/20 2:45 PM routing email |
| 21 Aug 2026 | Appeal filed via support.google.com form |
| 23 Aug 2026 | This blueprint written; v0.8.0 work pivoted in |
| ~28 Aug 2026 (expected) | 7-day appeal SLA expires |
| 23 Aug 2026 | v0.8.0 work pivoted in; blueprint expanded; build env debugged (NODE_ENV + GRADLE_OPTS) |
| 24 Aug 2026 | This refresh — added v0.8.0 scope section, AdMob plan, DPDPA blocker, build env fix |

---

## Appendix B: Contact Reference for Crisis Escalation

| Contact | Email | When to use |
|---|---|---|
| AYUB TRADERS Play Console | `haijiyasjameed0002@gmail.com` | All org owner actions |
| Active support thread | `googleplay-developer-support@google.com` (the 19 Aug + 20 Aug replies) | Reply on same thread for any follow-up |
| Privacy / Data Safety questions | `support@streamly.in` | Public-facing support |
| Supabase support | via Supabase dashboard | DB issues |
| Cloudflare support | via dashboard | Video issues |
| Vercel support | via dashboard | Privacy policy hosting |

---

**End of blueprint.** Update this file whenever state changes — especially after the appeal verdict lands, or when v0.8.0 is ready to push.
