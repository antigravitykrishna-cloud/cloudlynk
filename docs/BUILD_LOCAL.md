# Local Android build — Windows

For producing an **APK the client can sideload and test**. If you want the file
to upload to Play instead, that is an AAB — see §7; the two are not
interchangeable and an AAB cannot be installed on a phone.

Versions here are not guesses. They are what this project actually resolves:
React Native 0.85.3 → `@react-native/gradle-plugin` pins **AGP 8.12.0** and
**Kotlin 2.1.20**; the wrapper is **Gradle 9.3.1**.

---

## 1. What to install

| Component | Version | Notes |
|---|---|---|
| **JDK** | **17** | Correct. AGP 8.x requires 17 as a minimum and Gradle 9 runs on it. **Do not install 21** expecting it to be better — 17 is the supported pairing here. Temurin 17 or the JBR bundled with Android Studio both work. |
| **Android Studio** | current | You only need it for the SDK Manager; the build itself runs from the terminal. |
| **SDK Platform** | **API 36** | `compileSdk` and `targetSdk` are both 36. |
| **Build-Tools** | **36.0.0** | Pinned in `android/build.gradle`. A mismatch against compileSdk produces aapt2 errors that point nowhere near the cause. |
| **NDK** | **27.1.12297006** | Pinned. ~1 GB. Needed because `newArchEnabled=true`. |
| **Platform-Tools** | current | Gives you `adb` for installing the APK. |
| **CMake** | 3.22.1 | Pulled in by the NDK path; install it if the build asks. |

In Android Studio: **Settings → Languages & Frameworks → Android SDK**.
Tick **Show Package Details** on both tabs, or you will only see the latest of
each and not the exact revisions above.

---

## 2. Environment variables

Set these as **User** environment variables, then open a **new** terminal —
existing ones keep the old environment.

```
JAVA_HOME     C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot
ANDROID_HOME  C:\Users\MIT\AppData\Local\Android\Sdk
```

Add to `Path`:

```
%JAVA_HOME%\bin
%ANDROID_HOME%\platform-tools
```

Verify in a fresh terminal — both must answer before you go further:

```bash
java -version
```

```bash
adb --version
```

`java -version` must print **17**. If it prints 21 or 24, `JAVA_HOME` is being
shadowed by something already on `Path`; fix the ordering rather than working
around it, because Gradle picks up whichever `java` it finds first.

---

## 3. `android/local.properties`

Gradle finds the SDK through this file. It is machine-specific and gitignored.

```bash
printf 'sdk.dir=C\\:\\\\Users\\\\MIT\\\\AppData\\\\Local\\\\Android\\\\Sdk\n' > android/local.properties
```

The doubled backslashes are required — it is a Java properties file, where a
single backslash is an escape character.

---

## 4. Signing

Without this, the release build falls back to **debug signing**: it succeeds,
produces something that looks right, and Play rejects it. Pass
`-PCLOUDLYNK_REQUIRE_RELEASE_SIGNING=true` (§6) to turn that into a build
failure instead of a surprise.

The keystore is already in the repo working tree at
`android/app/cloudlynk-release.jks` (gitignored — it is not in any commit).
**Its passwords were not in the handover archive.**

Worth knowing before you go hunting for them: the existing
`apk/cloudlynk-v0.7.0-release.apk` is signed with
`CN=Cloudlynk, O=Cloudlynk, OU=Cloudlynk, C=IN` — not this project's debug key
(`CN=Android Debug, O=Unknown, C=US`). So whoever produced that build **had the
passwords working**, in a `gradle.properties` outside the repo. Ask them; that
is faster than a Play key reset.

Put them in **`C:\Users\MIT\.gradle\gradle.properties`** — your user-level
Gradle config, outside the repo:

```properties
CLOUDLYNK_RELEASE_STORE_FILE=cloudlynk-release.jks
CLOUDLYNK_RELEASE_STORE_PASSWORD=<store password>
CLOUDLYNK_RELEASE_KEY_ALIAS=<alias>
CLOUDLYNK_RELEASE_KEY_PASSWORD=<key password>
```

**Not** in `android/gradle.properties` — that file is tracked by git, so
anything you put there gets committed. `CLOUDLYNK_RELEASE_STORE_FILE` is
resolved by `file()` relative to `android/app/`, so a bare filename is correct.

If the passwords are genuinely lost, a new keystore is fine **as long as this
app has never been published**. Once it is on Play, the upload key is fixed and
changing it needs a Google-assisted reset.

---

## 5. Install dependencies

```bash
cd C:/Users/MIT/OneDrive/Desktop/cloudlynk
```

```bash
npm install
```

---

## 6. Build the APK

This is the one to hand your client.

```bash
cd android && ./gradlew clean assembleRelease -PCLOUDLYNK_REQUIRE_RELEASE_SIGNING=true
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

Expect **15–40 minutes** on a first build — the NDK toolchain and the Kotlin
and C++ compilation are all cold. Later builds are minutes.

Install it on a connected phone:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`-r` reinstalls over an existing copy. It will fail if the installed build was
signed with a different key — uninstall first in that case.

---

## 7. Build the AAB (for Play, not for testing)

```bash
cd android && ./gradlew clean bundleRelease -PCLOUDLYNK_REQUIRE_RELEASE_SIGNING=true
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

---

## 8. Verify what you actually built

Do not trust the filename. Run this against the artifact:

```bash
node scripts/audit-apk.mjs android/app/build/outputs/apk/release/app-release.apk
```

It reads the APK Signing Block and the manifest and reports the package, the
signing certificate, whether it is the debug key, and whether dev-client
symbols leaked in. Written because the handover asserted the previous APK was
debug-signed and it was not.

---

## 9. If it fails

| Error | Cause |
|---|---|
| `SDK location not found` | §3 missing, or the backslashes are not doubled |
| `Unsupported class file major version` | Wrong JDK. `java -version` must say 17 |
| `Installed Build Tools revision 36.0.0 is corrupted` | Re-install Build-Tools 36.0.0 from the SDK Manager |
| `NDK not configured` / `No version of NDK matched` | Install NDK **27.1.12297006** exactly, via Show Package Details |
| `Execution failed for task ':app:mergeReleaseNativeLibs'` | Usually disk space or a stale build — `./gradlew clean` first |
| `Keystore was tampered with, or password was incorrect` | Wrong password in `~/.gradle/gradle.properties` |
| Build fails demanding release signing | Intended. §4 is not set up |
| `Could not resolve all files` | Network, or a proxy blocking Maven |
| `Unable to delete directory '...\generated\ksp\...'` | **MAX_PATH.** See below — not a lock, despite what the message says |
| `Execution failed for task ':app:packageReleaseResources'` followed by a bare `Error: <some long path>` | **MAX_PATH.** Same cause |

### The Windows path-length trap

Both of those errors are the same problem wearing two disguises, and neither
message says so. Windows caps paths at **260 characters** unless
`LongPathsEnabled` is set. This checkout sits at

```
C:\Users\MIT\OneDrive\Desktop\cloudlynk
```

which is 133 characters before Gradle appends
`\android\app\build\intermediates\incremental\release\packageReleaseResources\merged.dir\values\...`.
Resource merging and KSP codegen both blow past the cap, and the failure
surfaces as a delete that "failed because a process has files open" — which
sends you hunting for a file lock that does not exist.

Check whether the cap is on:

```bash
reg query "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" /v LongPathsEnabled
```

`0x0` means the cap is active. Two ways out:

**A. Redirect the build output to a short path** (no admin rights, changes
nothing in the repo). Create `C:\clb\shortpath.init.gradle`:

```groovy
gradle.allprojects { p ->
    def safe = p.path.replace(":", "_")
    if (safe == "_") { safe = "root" }
    p.layout.buildDirectory.set(new File("C:/clb/" + safe))
}
```

then build with `-I`:

```bash
./gradlew assembleRelease --no-daemon -I C:/clb/shortpath.init.gradle
```

Outputs land in `C:\clb\_app\outputs\` instead of `android/app/build/outputs/`.

**B. Turn the cap off** (permanent, needs an **admin** shell, survives reboots):

```bash
reg add "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" /v LongPathsEnabled /t REG_DWORD /d 1 /f
```

Then restart the machine. This is the better long-term fix, but it is a
system-wide change — make it deliberately, not to unblock one build.

> **OneDrive makes this worse.** The checkout is inside a synced folder, so
> OneDrive can hold handles on files Gradle is trying to replace, and may store
> them as cloud-only placeholders. If builds are flaky here even after fixing
> path length, pause syncing (or move the project outside OneDrive) before
> spending time on anything else.

---

## 10. What the client will and will not be able to test

The backend migrations **v57–v60 are not deployed** — that needs a Supabase
login. So in this build:

**Works normally:** sign-up and sign-in, Explore, channels, storage and the
15 GB meter, free video playback, premium gating, report and block, account
deletion, all the legal pages.

**Will not work, by design and visibly:**
- **Buying Premium** — `IAP_PROVIDER` is `noop`, so the plan list shows
  *"Premium purchases are not available yet."* That is honest, not broken:
  there is no Play Console account and payments are moving to web + UPI.
- **Admin → Edit post / Replace video** — the v59 RPCs are not deployed. The
  screen now says the migration has not been deployed rather than showing a
  raw Postgres error.

Everything else on the admin panel — publish, unpublish, free/premium, grant,
revoke, audit log, reports — works against the currently deployed backend.

Tell the client those two things up front, or they will file them as bugs.
