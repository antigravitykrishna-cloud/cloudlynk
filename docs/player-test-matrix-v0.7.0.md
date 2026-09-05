# Streamly v0.7.0 — Player manual test matrix

Date: 2026-08-03
Branch under test: `bugfix7-player` (player fix) → `launch-hardening` (security/launch layer)
Player file: `components/VideoPlayerOverlay.tsx` (expo-video v6.x, `nativeControls={false}`, custom bottom row, PanResponder gestures)
Manifest change: `android/app/src/main/AndroidManifest.xml` — `android:screenOrientation="portrait"` removed from main activity to allow auto-rotate

**This is a manual test plan, not an automated suite.** v0.7.0 has no Playwright/E2E coverage for the player (and the player is a native module anyway, so E2E in CI is hard). All cases below must be exercised on a real device or a fresh emulator with a working network and a logged-in test user.

**How to use this doc:** each test case has a `Pass?` column for the tester to fill in (✅/❌/⚠️ + 1-line note). Anything marked ❌ or ⚠️ is a release blocker unless explicitly noted otherwise.

---

## 0. Pre-flight

| # | Check | Pass? |
|---|---|---|
| 0.1 | APK is built from `bugfix7-player` or `launch-hardening` (`eas build` artifact or `gradlew assembleRelease`), not from `main`. Verify by checking `app.json` `version` = `0.7.0` and `versionCode` >= the value of the most recent Internal Testing release. | |
| 0.2 | App is installed via `adb install` to a fresh device/emulator (no cached state from prior versions). | |
| 0.3 | Test account is logged in with at least one channel that has at least 3 episodes (1 short, 1 medium ~5 min, 1 long > 15 min). Different aspect ratios: 1 vertical (9:16), 1 landscape (16:9), 1 square (1:1). | |
| 0.4 | Network is on real Wi-Fi (not emulator host loopback). Test once on 4G to confirm buffering UX works. | |
| 0.5 | adb logcat running, filtered to `Streamly`/`ReactNativeJS`/`ExoPlayer` (so a crash or unhandled promise is captured for every test case). | |

If 0.1–0.4 fail, stop. The matrix is invalid.

---

## 1. Cold-start playback (smoke test)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1.1 | Force-stop the app (`adb shell am force-stop com.streamly.app`), relaunch from launcher icon. | App opens to Explore, no splash hang, no red-box error. | |
| 1.2 | Tap any post thumbnail on Explore. | Player opens in portrait, video starts playing within 2s on Wi-Fi (5s on 4G). | |
| 1.3 | Watch for 10s. | No buffering spinner except at the very first load. No black screen flicker. Audio + video in sync. | |
| 1.4 | Press the system back button. | App returns to Explore. Player is destroyed (verify with `adb shell dumpsys media_session` — no active session for the app). | |

## 2. Orientation

| # | Action | Expected | Pass? |
|---|---|---|---|
| 2.1 | Open a vertical (9:16) video. | Plays in portrait, video fills width, letterboxed top/bottom. | |
| 2.2 | Rotate device to landscape. | Video re-fits to landscape, controls reposition, no overlap. | |
| 2.3 | Rotate back to portrait. | Returns to portrait, player still playing. | |
| 2.4 | Open a landscape (16:9) video. Rotate phone to portrait. | Video re-fits, no clipping. | |
| 2.5 | From landscape player, press back. | Returns to portrait Explore, orientation is locked back to portrait (per `handleClose` → `ScreenOrientation.lockAsync(PORTRAIT_UP)`). | |
| 2.6 | From landscape player, lock screen rotation via system quick-settings, then press back. | Should still return to portrait Explore. If it stays in landscape, the `handleClose` orientation lock is being called before `onClose` finishes — log a bug. | |

## 3. Custom controls (the `nativeControls={false}` overlay)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 3.1 | Top bar: tap **✕** (close). | Returns to Explore, orientation locked to portrait. | |
| 3.2 | Top bar: tap **⚙** (settings). | Settings panel appears with two rows: **Quality** (480p / 720p / 1080p) and **Speed** (0.5× / 0.75× / 1× / 1.25× / 1.5× / 1.75× / 2×). | |
| 3.3 | Settings panel: confirm there is **only one** ⚙ button (top bar), no second settings button in the bottom row. (This was the bugfix7 regression — there used to be two.) | Exactly one ⚙ icon visible. | |
| 3.4 | Settings: tap **1080p** chip. | Chip turns highlighted (brand color), persists across videos for this user (verify by closing + reopening the player, the 1080p chip is still the default). | |
| 3.5 | Settings: tap **1.5×** speed. | Chip highlights, video immediately plays at 1.5× rate (audible change). | |
| 3.6 | Settings: tap outside the panel (e.g. center of video) to dismiss. | Panel hides. (Note: this currently doesn't dismiss on outside-tap in v0.7.0 — see §3.6a.) | |
| 3.6a | Documented limitation: settings panel does NOT close on outside tap in v0.7.0. Closing requires tapping the ⚙ button again. Acceptable for launch; track as v0.7.1 improvement. | n/a (this is a known limitation, not a bug) | |
| 3.7 | Bottom row: tap **▶** / **⏸** icon. | Toggles playback. Icon updates. | |
| 3.8 | Bottom row: confirm the time text shows `currentTime / duration` and updates at least 4× per second (matches the `timeUpdateEventInterval = 0.25` change in `useEffect` of the player file). | Time counts up smoothly, no janky 1-second ticks. | |
| 3.9 | Bottom row: drag the progress bar. | Scrub preview follows finger, video seeks on release. | |
| 3.10 | Bottom row: tap a fixed point on the progress bar. | Video seeks to that position within 500ms. | |

## 4. Gestures (PanResponder, not RNGH)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 4.1 | Double-tap the **left 80px edge strip**. | Video jumps back 10s. A `⏪ 10s` feedback chip appears for ~700ms then fades. | |
| 4.2 | Double-tap the **right 80px edge strip**. | Video jumps forward 10s. A `10s ⏩` feedback chip appears for ~700ms. | |
| 4.3 | Double-tap **center of the video** (not on an edge strip or any other UI). | Should do nothing — center is not a gesture target. (Single-tap is reserved for the native VideoView, see §4.7.) | |
| 4.4 | Slowly drag from left edge across to right edge. | Should NOT trigger skip (gesture is on tap, not on swipe). Verify by checking `currentTime` after the drag. | |
| 4.5 | From 0:00, single-tap left edge, wait 500ms, single-tap left edge again. | Should NOT skip — the 300ms `DOUBLE_TAP_MS` window expired. | |
| 4.6 | Three quick taps on left edge within 500ms. | First tap starts a 300ms window. Second tap fires the `-10s` skip and clears the window. Third tap starts a new window but has no paired second tap → no second skip. So result is exactly 1 × `-10s`. | |
| 4.7 | Single-tap **center of the video**. | Documented limitation: in v0.7.0 we removed the tapOverlay that toggled controls on center-tap (it was conflicting with edge strips and causing the controls to flicker). So single-tap on center does nothing. The controls are persistently visible (no auto-hide in v0.7.0 — see §4.8). | |
| 4.8 | Documented limitation: top bar, bottom row, and settings panel are **always visible** in v0.7.0 — no auto-hide timer. Acceptable for launch; v0.7.1 should add a 3-second auto-hide. | n/a (known limitation) | |

## 5. Episode navigation (only when next/prev is wired in the host)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 5.1 | Open a post that has both `nextPostId` and `prevPostId` provided (e.g. inside a series, opened from the channel page). | Two pill buttons appear: `← Prev` and `Next →` just above the bottom row. | |
| 5.2 | Tap `← Prev`. | Player swaps to the previous episode, `currentTime` resets to 0, plays from start (or shows the resume overlay if previously watched). | |
| 5.3 | Tap `Next →` at the end of a video's credits. | Player advances to the next episode. | |
| 5.4 | Open the first episode of a series (no `prevPostId`). | Only `Next →` is shown; `← Prev` slot is empty space. | |
| 5.5 | Open a single standalone post (no series). | No episode nav row at all. | |

## 6. Resume overlay (uses `useResumePosition` + `user_preferences`/`watch_history`)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 6.1 | Watch a 60s video to 0:30. Close the player. Reopen the same post. | A "Resume from 0:30" card appears with two buttons: **▶ Resume** and **Restart**. | |
| 6.2 | Tap **▶ Resume**. | Video jumps to 0:30 and continues. | |
| 6.3 | Reopen the same post, tap **Restart**. | Video plays from 0:00. | |
| 6.4 | Watch to 100% (`completed = true` in `watch_history`). Close. Reopen. | Documented: `useResumePosition` should NOT show the resume overlay for completed videos — verify by checking that the overlay does NOT appear. If it does, the v42 migration's `completed` column isn't being read correctly — file a bug. | |
| 6.5 | Fresh install, no watch history. Open a video. | No resume overlay; video plays from 0:00. | |

## 7. Premium gating (player doesn't bypass paywall)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 7.1 | Log in as a free user. Open a post marked premium. | The Explore tap should be blocked BEFORE the player opens (the `profiles.plan_status !== 'active'` check is in Explore/channel, not in the player itself). Verify: player does NOT open, instead the paywall or subscription screen appears. | |
| 7.2 | Log in as a free admin user (admin + free plan). Open a premium post. | Admin should bypass the paywall (per the v2.7.0 bugfix that added admin bypass to Explore). | |
| 7.3 | Log in as an active premium user. Open a premium post. | Player opens normally. | |

## 8. Error / edge cases

| # | Action | Expected | Pass? |
|---|---|---|---|
| 8.1 | Turn on airplane mode mid-playback. | Video continues to the buffered edge, then pauses. No crash. Resumes when network returns. | |
| 8.2 | Open a post whose `media_url` is a 404. | Player shows the video view but stays in a loading/blank state. After ~10s the host screen should show an error toast. (The player itself doesn't surface "video failed to load" — confirm this is the case, otherwise it's actually a bug.) | |
| 8.3 | Open a post whose `media_url` is a 200 but `Content-Type: text/html` (e.g. a misconfigured Cloudflare Stream UID). | Same as 8.2 — player blank, host error toast. | |
| 8.4 | Rapidly tap 5 different posts on Explore within 2 seconds. | The first opens normally. The rest are ignored or queue up — no zombie players, no overlapping audio. If two players are audible, file a bug. | |
| 8.5 | Background the app (home button) while a video is playing. | Audio continues if `Audio` mode is set; in v0.7.0 audio continues in foreground only — verify. Backgrounding should pause, returning should resume. | |
| 8.6 | Open a post, then rotate phone 10 times in 5 seconds. | No crash, no black screen, no console error in logcat filtered to `ExoPlayer`. | |
| 8.7 | From player, tap settings, change quality, tap settings again to dismiss, then tap settings a third time. | Panel shows with the newly-selected quality still highlighted. | |
| 8.8 | Press system back button while settings panel is open. | Documented limitation: back button does NOT dismiss the settings panel — it closes the whole player. Acceptable for launch; v0.7.1 should add a back-handler for the panel. | |

## 9. Player preferences persistence (cross-launch)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 9.1 | Set quality = 1080p in settings. Force-stop the app. Relaunch. Open any video. | Settings panel default selection is 1080p. | |
| 9.2 | Set speed = 1.5×. Force-stop. Relaunch. Open any video. | Default speed is 1.5× (verify by looking at the bottom-right or settings panel). | |
| 9.3 | Log in as a different user on the same device. Open a video. | That user's saved prefs (not the previous user's) are the default. (Cross-user isolation is critical because `PlayerPrefsService.get(userId)` is keyed on `userId`, not on device — see the TanStack persister gotcha in the same vein.) | |

## 10. Logcat hygiene

| # | Action | Expected | Pass? |
|---|---|---|---|
| 10.1 | Run logcat for 60s while a video plays, with filter `*:S ReactNativeJS:V`. | No `console.log`/`console.error` from app code in the log (because of the v0.7.0 `__DEV__` gating). Server-side `ExoPlayer` info lines are expected. | |
| 10.2 | Force a crash: kill the app mid-upload while in a "ready to upload" state, then reopen. | No native crash on relaunch. (If there is, it's a separate bug from the player; log it but don't block launch on it.) | |
| 10.3 | Run a 5-minute playback session with no user interaction. | No `ANR` (Application Not Responding) in logcat. No `ExoPlayer` error. | |

---

## Pass criteria for v0.7.0 release

- All cases in §0, §1, §2, §3 (except 3.6a), §4, §5, §6, §7 must pass.
- §3.6a and §4.7 and §4.8 and §8.8 are documented limitations; they are not blockers but must be filed as v0.7.1 tickets.
- §8.1–8.4 must not crash; minor UX issues can be filed as v0.7.1 but cannot be launch blockers.
- §9 and §10 must pass.

**Two-fail rule:** if the same test case fails twice on the same build, stop testing and file a blocker. Don't burn time chasing flaky tests during a launch window.

---

## Logcat cheat sheet

```powershell
# Tail ReactNativeJS + ExoPlayer only
adb logcat -v time ReactNativeJS:V ExoPlayer:V AudioFlinger:V *:S

# Capture full log to file for a single test
adb logcat -c                                          # clear
# (run the test)
adb logcat -d -v time > D:\Joliffy\jollify\logs\test-<name>.txt

# Confirm app is fully killed (so we know cold start is real)
adb shell am force-stop com.streamly.app
adb shell pidof com.streamly.app                       # should print nothing
```

## What this matrix does NOT cover

- **Background playback / picture-in-picture** — `allowsPictureInPicture` is set on `VideoView` but v0.7.0 has no explicit PiP UI test. v0.7.1.
- **Subtitle rendering** — `subtitles` table is created in v42, but the player file doesn't reference it. v0.7.1.
- **Cast / AirPlay** — not implemented.
- **Download for offline** — not implemented.
- **HDR / Dolby** — not implemented, Cloudflare Stream is the source.

These are acceptable omissions for v0.7.0 launch; flag them as v0.7.1+ scope, not bugs.
