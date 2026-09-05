# Streamly Test Plan

This document outlines the rigorous end-to-end testing required before submitting the EAS production build to the Play Store.

## Prerequisites
- Test on an Android emulator or a physical device.
- Use a local debug build (`npx expo run:android`) or an EAS preview build (`eas build -p android --profile preview`).
- **Accounts:**
  - `krishnapate43@gmail.com` — Admin, Standard Plan, Paid Acquisition.
  - Test Free Users — Create fresh accounts as needed.

---

### Test 1 — Fresh install, organic user
- [ ] 1. Clear app data on emulator or uninstall + reinstall.
- [ ] 2. Launch — should show splash, then route to login.
- [ ] 3. Sign up with a new email (e.g., `organic-test@streamly.com`).
- [ ] 4. **Verify:** Land on Home. Greeting, storage card (15 GB free, 0 used), quick actions, recent files. **No "Channel Feed" section.** Bottom tab bar has 3 tabs (Home, Files, Profile) — **no Channels tab**.
- [ ] 5. Open Profile → plan badge says **FREE**.

### Test 2 — Switch to paid via DEV TOOLS (no reinstall needed)
- [ ] 1. On the same organic user, open Profile.
- [ ] 2. Scroll to the bottom, find the **DEV TOOLS** panel (yellow on dark, only visible in dev builds).
- [ ] 3. Tap **"Set acquisition: PAID"**.
- [ ] 4. **Verify:** A toast/alert confirms. Then **kill the app and relaunch** (acquisition source loads on mount).
- [ ] 5. **Verify:** Channels tab now appears in the bottom bar. Home shows a "Channel Feed" section (probably empty for a brand new user).

### Test 3 — Reset to organic
- [ ] 1. DEV TOOLS → "Set acquisition: ORGANIC".
- [ ] 2. Kill + relaunch.
- [ ] 3. **Verify:** Channels tab is gone again.

### Test 4 — Create a private channel (skips 7-day review)
- [ ] 1. As a paid user, open Channels → tap **+ New**.
- [ ] 2. Name: `Test Channel`. Description: anything. Toggle **Public** to OFF (private).
- [ ] 3. Tap **Create**.
- [ ] 4. **Verify:** Modal closes, channel appears in "My Channels" with a **🔒 Private** badge (no 7d review waiting). Auto-subscribed as Owner.
- [ ] 5. Tap into the channel.
- [ ] 6. **Verify:** Hero screen, **+ Add Content** button visible (because `canUpload` is true on this test user). Empty state copy says "Subscribe to this channel to see and add content" — but you ARE subscribed, so the **+ Add Content** button at the bottom should appear.

### Test 5 — Upload a video (lands in pending)
- [ ] 1. Tap **+ Add Content** → Create modal opens.
- [ ] 2. Content type: **Movie**. Tap video picker → select a small MP4 from the emulator (or use the emulator's pre-loaded sample video).
- [ ] 3. Set thumbnail (any image). Title: `Test Movie`. Description: `Test description`. Genre: `Action`. Duration: `10`. Release year: current.
- [ ] 4. Tap **Submit**.
- [ ] 5. **Verify:** Progress bar fills, modal closes, alert "Submitted ✓ Your content is under review". The channel now shows a **⏳ Pending Review** section at the top with your submission.

### Test 6 — Admin approval via mobile
- [ ] 1. Sign out, sign in as `krishnapate43@gmail.com` (admin).
- [ ] 2. Tap the **🛡️ Admin Panel** row in Profile, OR tap the admin icon in the Home header (the red dot with the pending count).
- [ ] 3. **Verify:** Admin panel opens. Tabs: Channels, Posts. Posts tab should show the test video you just submitted.
- [ ] 4. Tap **✓ Approve**.
- [ ] 5. **Verify:** Alert "✓ Post approved, author notified". Post disappears from the queue.

### Test 7 — HLS playback (the bug we fixed)
- [ ] 1. Sign back in as the paid test user.
- [ ] 2. Open the test channel — your video should now be in the **Movies** genre row.
- [ ] 3. Tap the video → Detail modal opens.
- [ ] 4. Tap **▶ Play Video**.
- [ ] 5. **Verify:** Video starts playing in fullscreen using HLS (.m3u8). Should NOT be a white screen or "video can't be played" error. The Cloudflare Stream HLS manifest loads.

### Test 8 — Profile settings persistence
- [ ] 1. Open Profile, flip **Auto Backup** off, **Wi-Fi Only** on, **Notifications** off.
- [ ] 2. Kill the app, relaunch.
- [ ] 3. **Verify:** All three settings persist. (This validates the real-time mutation in profile.tsx and the `notifications_enabled` check that drives push token sync in `_layout.tsx`.)

### Test 9 — Force the paywall (dev affordance, no 30 min wait)
- [ ] 1. Sign up another fresh free user.
- [ ] 2. Open Profile → DEV TOOLS → **"Force paywall (set usage → 30 min)"**.
- [ ] 3. **Verify:** PaywallModal slides up immediately with the three plan cards (Basic / Standard $4.99 / Premium $12.99). Hero says "You've used your free 30 min".
- [ ] 4. Tap **Get Standard** → Google Play native sheet appears (or "Billing Error" if no Play account on emulator — expected on a bare emulator).
- [ ] 5. Tap **Dismiss / X** on the paywall → paywall closes, but using the app continues to work. (Note: this is the soft-dismiss behavior — the timer persists, the paywall re-shows on next session.)
- [ ] 6. DEV TOOLS → **"Reset usage timer"** to clear.

### Test 10 — Sign out flow
- [ ] 1. Profile → **Sign Out** → confirm.
- [ ] 2. **Verify:** Routes back to login. Bottom tab bar is gone. No flash of authenticated content.

---

## Bug capture template

For any issues, please log them in this format:

```
Test #X — <title>
Steps to reproduce: ...
Expected: ...
Actual: ...
Screenshot: <path to file>
Device/emulator: ...
Free/Paid/Admin: ...
```
