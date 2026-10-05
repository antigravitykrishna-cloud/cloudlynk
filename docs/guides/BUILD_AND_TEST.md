# Cloudlynk — build & test this on your S24 Ultra

This delivers a real, signed, installable build — not just code fixes. Here's
what changed, why, and exactly what to run.

## What's in this package

Extract this zip directly into your project root (`D:\Joliffy\jollify`),
overwriting when asked. It replaces:

- `android/` — completely regenerated from your current `app.json` via
  `expo prebuild --clean`. Your previous `android/` folder had native Kotlin
  source sitting under the OLD `com/streamly/cloud/` package path even though
  `applicationId`/`namespace` had already been updated to `com.cloudlynk.app`
  — this regeneration puts the source under the correct `com/cloudlynk/app/`
  path and fixes a few other things below.
- `plugins/withRemoveAndroidPermissions.js` — new. Makes a permission cleanup
  you were previously doing by hand after every prebuild permanent (see
  "Permissions" below).
- `app.json`, `package.json`, `package-lock.json`, `lib/supabase.ts` — see
  the bug list below.

**Before you extract:** delete your current `android` folder
(`Remove-Item -Recurse -Force android` from the project root) — you mentioned
disk space is tight, and this replaces it entirely anyway.

## Real bugs fixed

1. **`app.json` had `react-native-iap` listed as a config plugin, but the
   installed version (15.6.2) ships no plugin file at all.** This crashes
   `expo prebuild` / `expo start` immediately with `PluginError: Unexpected
   token 'typeof'`. Removed it — confirmed prebuild and `expo start` now run
   clean.
2. **`package.json` pinned `react-native-nitro-modules` to a version
   `react-native-iap` doesn't support** (`^0.35.9`, needs `^0.36.1`) — `npm
   ci` fails outright on a fresh install. Bumped it and regenerated the
   lockfile.
3. **Permissions that keep coming back.** Your `AndroidManifest.xml` had a
   comment explaining that `SYSTEM_ALERT_WINDOW`, legacy
   `READ/WRITE_EXTERNAL_STORAGE`, and `READ_MEDIA_AUDIO` were manually
   removed for Play compliance, but would silently reappear on the next
   `expo prebuild --clean` since nothing regenerates that removal
   automatically. That's exactly what happened when I regenerated the
   folder. Fixed properly this time: `plugins/withRemoveAndroidPermissions.js`
   strips these every time, permanently, and `expo-media-library`'s plugin
   config now explicitly requests only `photo`+`video` (not `audio`). You
   should never have to manually edit the manifest for this again.
4. **`com.android.vending.BILLING` was missing** from the regenerated
   manifest — it was in your old committed manifest but nothing in
   `app.json` was actually requesting it, so a fresh prebuild silently drops
   it. Without it, real Google Play Billing (once you move off
   `IAP_PROVIDER=noop`) cannot work at all. Added it to `app.json`'s
   `android.permissions`, where it'll survive future regenerations.
5. **`lib/supabase.ts`'s hand-written database types were missing 6
   `profiles` columns** (`birth_year`, `terms_accepted_at`, `terms_version`,
   `community_guidelines_version`, `privacy_version`, `account_status`) that
   two migrations added months ago. This is what breaks the type-check on
   `app/_layout.tsx`'s age-gate/compliance logic. Added them.
6. **No working release signing existed.** `android/local.properties` had
   leftover `STREAMLY_UPLOAD_*` keys with a real password in them — but
   those keys were never actually wired to anything (Gradle doesn't read
   custom keys from `local.properties` on its own), and the `.jks` file
   they referenced doesn't exist. So every "release" build was silently
   falling back to debug signing. Since you confirmed this has never been
   published to Play, I generated a **real, brand-new upload keystore**
   (`android/app/cloudlynk-release.jks`) and wired it in properly — see
   below.

## The keystore — read this before you do anything else

`android/app/cloudlynk-release.jks` is now the actual signing identity of
this app. **Back this file up somewhere outside this project folder right
now** (a password manager's file storage, a private cloud drive — not just
this laptop). If you lose it after publishing to Play, you can never push an
update to that listing again under the same identity.

The store/key passwords are already filled into `android/local.properties`
(gitignored — never gets committed) so `gradlew` picks them up automatically.
If you ever run `npx expo prebuild --clean` again yourself, this signing
block gets wiped from `android/app/build.gradle` (prebuild regenerates that
file from scratch) — re-add it from this same package's `android/app/build.gradle`,
or ask me and I'll hand you the block again.

## Build it

```powershell
cd D:\Joliffy\jollify
npm install
cd android
.\gradlew.bat assembleRelease
```

This produces a **real, production-signed** APK at
`android\app\build\outputs\apk\release\app-release.apk` — the same signing
that will eventually go on Play, so testing this build is meaningful, not a
throwaway debug build.

## Install on your S24 Ultra and test

1. Connect the phone via USB with USB debugging on (you said this is already
   enabled).
2. `adb install -r android\app\build\outputs\apk\release\app-release.apk`
3. Test every feature you care about — sign-up/sign-in, photo/video upload,
   channel creation and browsing (public + private), premium video playback,
   the premium purchase flow (still a UI-only "noop" purchase right now,
   not real Google Play Billing yet), storage usage display, notifications
   if wired up, and anything else specific to how this app is meant to be
   used.

## Once you're happy with it: the actual Play-ready AAB

Same signing, same command shape, different Gradle task:

```powershell
cd android
.\gradlew.bat bundleRelease
```

Output: `android\app\build\outputs\bundle\release\app-release.aab` — this is
the file Play Console's "Create new release" screen asks you to upload.

## What's still not something I can fix from here

- **`IAP_PROVIDER=noop`** — no real Google Play Billing integration yet.
  The premium purchase button works as a UI flow but doesn't charge anyone
  through Play. This needs `IAP_PROVIDER=google_play` plus real product IDs
  configured in Play Console, which only exists once you have an app listing
  there.
- **EAS project ownership** (`app.json`'s `owner: "southern-methodist-university"`)
  — only matters if you use `eas build`/`eas submit`; irrelevant to the
  local Gradle build above, but worth fixing before you ever touch EAS.
- **Play Console setup itself** — app listing, content rating
  questionnaire, data-safety form, billing/subscription products, and the
  actual submission — all Play Console admin work only you can do.
- I can't run an Android emulator or touch a physical device from here, so
  the phone test above is the real functional check this project has had.

## A decision I still need from you (unrelated to this build)

The repo (on GitHub, not this local folder) has a second, unrelated ~4,000-line
native Kotlin/Compose Android app under `app/src/main/java/com/cloudlynk/app/`
with its own local database and zero connection to Supabase/Cloudflare — built
by a different tool entirely, not by hand and not by me. It doesn't affect
this build at all (it's not part of this Expo project), but it's worth
confirming with whoever committed it whether that's an intentional parallel
rewrite or scaffold pollution that should be removed from the repo.
