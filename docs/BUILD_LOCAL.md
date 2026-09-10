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
cd C:/dev/cloudlynk
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
`LongPathsEnabled` is set. This checkout **used to** sit at

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

**A. Keep the project on a short path outside OneDrive.** This is what was
actually done on 2026-09-10 — the checkout now lives at `C:\dev\cloudlynk`
(17 characters) and the problem stops being reachable. Nothing else is needed.

If you ever have to build a checkout that is stuck on a long path, a directory
junction gives Gradle a short alias without moving anything, and `mklink /J`
needs no elevation (unlike `/D` symlinks):

```bash
cd /c && cmd //c "mklink /J cl C:\\some\\very\\long\\path\\to\\cloudlynk"
```

> Note the junction only shortens what *you* type. Gradle canonicalises paths
> for anything under `node_modules`, so it did **not** help with the KSP and
> CMake failures here — only moving the checkout did.

Then build from the alias instead of the real path:

```bash
cd /c/cl/android && ./gradlew assembleRelease --no-daemon
```

The APK appears at `android/app/build/outputs/apk/release/` as normal — it is
the same folder, reached by a shorter name. `mklink /J` needs no elevation
(unlike `/D` symlinks). Delete it with `cmd //c "rmdir C:\cl"`; that removes
the alias only, never the contents.

> **Do not try to relocate `buildDirectory` with a Gradle init script.** It is
> the obvious idea and it fails: React Native's autolinking writes
> `generated/autolinking/autolinking.json` into the root build directory while
> `settings.gradle` is being evaluated, before an `allprojects` hook can run.
> The writer uses the old location, the reader looks in the new one, and the
> build dies with `autolinking.json (The system cannot find the path
> specified)`. Shorten the input path, not the output path.

**B. Turn the cap off** (permanent, needs an **admin** shell, survives reboots):

```bash
reg add "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" /v LongPathsEnabled /t REG_DWORD /d 1 /f
```

Then restart the machine. This is the better long-term fix, but it is a
system-wide change — make it deliberately, not to unblock one build.

> **The project moved out of OneDrive on 2026-09-10** for exactly this reason.
> Canonical location is now `C:\dev\cloudlynk` — 17 characters instead of 133,
> and outside the sync root. If you find yourself working in
> `C:\Users\MIT\OneDrive\Desktop\cloudlynk`, that is the stale copy; delete it.

### THE WORKING RECIPE (2026-09-10)

After a day of failures, this is the combination that produces a release
build on this machine. Use it; the reasoning is below if you need it.

```bash
cd /c/dev/cloudlynk

# 1. Break hard links on every native library in the build tree.
find node_modules android -name "*.so" -path "*build*" | while read f; do
  [ "$(stat -c '%h' "$f")" -gt 1 ] && cp "$f" "$f.t" && rm "$f" && mv "$f.t" "$f"
done

# 2. Build ARM-only, with the CMake tasks untracked.
cd android && ./gradlew assembleRelease bundleRelease --no-daemon \
  -I ../scripts/untracked-cmake.init.gradle \
  -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

Result: APK 82 MB, AAB 61 MB, 12 minutes.

All three parts are load-bearing:

- **Delinking** clears the files that already exist.
- **`-I untracked-cmake.init.gradle`** stops Gradle fingerprinting CMake task
  outputs, so newly created links do not fail the build.
- **ARM-only** removes `obj/x86/...`, which is where the failure kept landing,
  and is the right production choice anyway — see the ABI note below.

**ABI trade-off.** `arm64-v8a` + `armeabi-v7a` covers every real Android phone
and takes the APK from 142 MB to 82 MB (x86 and x86_64 were 57.8 MB of native
libraries between them). The cost is that the APK **will not install on an
x86_64 emulator**, including this project's `cloudlynk_test` AVD. For an
emulator-installable artifact, add `,x86,x86_64` to `reactNativeArchitectures`.
For Play this matters less than it looks: an AAB is split per ABI, so a device
only ever downloads the slice it needs.

### The `libc++_shared.so: not a regular file` failure

The most stubborn failure on this machine, and the one that wastes the most
time because it moves around:

```
Execution failed for task ':<some-native-module>:buildCMakeRelWithDebInfo[arm64-v8a]'.
> Cannot access output property 'soFolder' ...
   > java.io.IOException: Cannot snapshot ...\obj\arm64-v8a\libc++_shared.so: not a regular file
```

The NDK emits `libc++_shared.so` into each native module's CMake output as a
link rather than a copy, and Gradle 9.3.1's snapshotter refuses to fingerprint
it. It surfaced on `react-native-nitro-modules`, then `react-native-screens`,
then `expo-modules-core` — clearing one module just moves it to the next.

**What actually works: a build with no prior CMake state at all.** Every
successful release build here has been from a freshly installed `node_modules`.
Partial cleans do not do it, and neither does clearing the Gradle transform
cache — that makes it worse, by forcing a native reconfigure over half-stale
outputs.

```bash
# From the project root
rm -rf node_modules
npm ci
cd android && ./gradlew assembleRelease bundleRelease --no-daemon
```

Note `rm -rf node_modules` rather than hunting for `android/build` directories.
A `find -maxdepth 4` misses nested copies such as
`node_modules/expo/node_modules/expo-modules-core`, which is precisely how one
attempt failed after appearing to clean everything.

The three machine-level fixes that stop this recurring — long paths enabled,
project out of OneDrive, and antivirus exclusions on the project, `~/.gradle`
and any build workspace — are listed at the top of §9.

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
