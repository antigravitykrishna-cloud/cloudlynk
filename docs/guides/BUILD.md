# Cloudlynk — Build Guide

## Prerequisites

- Node.js 18+
- Java 17 (for Gradle)
- Android SDK (API 36 — Google Play requires apps/updates to target API 36
  by Aug 31, 2026, extendable to Nov 1, 2026 with an exception request)
- EAS CLI: `npx eas-cli` (installed as devDependency)

## Version Bumping

Before each release, update version in **three** places:

1. `package.json` → `"version"`
2. `app.json` → `expo.version`
3. `android/app/build.gradle` → `versionCode` + `versionName`

For EAS cloud builds, set `"autoIncrement": true` in `eas.json` production profile
to auto-bump `versionCode` on each build.

## Release Signing (Local Builds)

The release keystore lives at `android/app/cloudlynk-release.jks` (gitignored).
Generate it with:

```bash
keytool -genkeypair -v -keystore cloudlynk-release.jks \
  -alias cloudlynk -keyalg RSA -keysize 2048 -validity 10000
```

Signing properties are in `android/local.properties` (also gitignored) —
these must match the property names read in `android/app/build.gradle`:

```properties
CLOUDLYNK_RELEASE_STORE_FILE=cloudlynk-release.jks
CLOUDLYNK_RELEASE_STORE_PASSWORD=<password>
CLOUDLYNK_RELEASE_KEY_ALIAS=cloudlynk
CLOUDLYNK_RELEASE_KEY_PASSWORD=<password>
```

Keep a backup of the keystore and password in a secure location (1Password, etc.).
If you lose the upload keystore, you can request a key reset from Google Play Console,
but it takes time.

## Before your first build: regenerate the native project

The `android/` folder in this repo was generated once from an older
`app.json` and has drifted since (package name, permissions, and deep-link
scheme have all been manually patched to catch up — see the comments in
`AndroidManifest.xml`). More importantly, **it is currently missing its
Kotlin/Java source files** (`MainActivity`, `MainApplication`, etc.) —
there is no `android/app/src/main/java` or `.../kotlin` directory at all,
which means `./gradlew bundleRelease` / `assembleRelease` will not
succeed as-is. Run this once, from a machine with Node/npm and the Expo
CLI installed, before your first local or EAS build:

```bash
npx expo prebuild --platform android --clean
```

This regenerates `android/` from `app.json` (which already has the
correct `com.cloudlynk.app` identity, permissions, and `cloudlynk` scheme)
including the missing native source. After running it, re-check
`android/app/build.gradle`'s signing block and `AndroidManifest.xml`'s
permission comments still match what's described below — prebuild
respects `app.json` and installed config plugins, so anything not
expressed there (like the SYSTEM_ALERT_WINDOW exclusion) needs a config
plugin or it will need to be manually removed again.

## Build Commands

### Local AAB (Play Store)

```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

### Local APK (sideload testing)

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

### EAS Cloud Build — Production AAB

```bash
npx eas-cli build --platform android --profile production
```

First run will prompt to upload keystore to Expo's secure storage via `npx eas credentials`.

### EAS Cloud Build — Preview APK (internal testing)

```bash
npx eas-cli build --platform android --profile preview
```

Generates a signed APK for internal distribution (sideload to testers).

## EAS Credentials

Upload the keystore to EAS for cloud builds:

```bash
npx eas-cli credentials
```

Select Android → production → Upload keystore → provide the .jks file and passwords.

## Play Store Submission (TODO)

Submission is configured in `eas.json` under `submit.production.android`.
Requires a Google Play service account key (`google-play-key.json`, gitignored).

Setup steps (next batch):
1. Create a service account in Google Cloud Console
2. Grant access in Play Console → API access
3. Download the JSON key to `./google-play-key.json`
4. Run: `npx eas-cli submit --platform android --profile production`

## Known Issues

- EAS `autoIncrement` only works with EAS cloud builds, not local Gradle builds
- ProGuard/R8 is disabled by default (`enableMinifyInReleaseBuilds=false`). Enable
  in `gradle.properties` when bundle size becomes a concern.
- The `google-play-key.json` service account key is not yet set up
