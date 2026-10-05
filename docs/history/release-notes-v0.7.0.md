# Streamly v0.7.0 — Release notes

**Public release notes for the Play Store listing.** These are the "what's new" text shown to users on the Play Store. Keep it short, user-facing, no internal jargon. The "developer notes" section below has the long version with file:line references — that's for the team, not for the listing.

---

## Play Store "What's new" — short (≤ 500 chars)

> **Streamly v0.7.0 is here!**
>
> **Watch on your terms** — a brand-new player with smart quality switching, 0.5× to 2× playback speed, and instant seek on a tap-anywhere progress bar. Double-tap the edges of the video to skip 10 seconds.
>
> **Series, made simple** — upload multiple episodes at once and let Streamly auto-organize them by series. The Explore page now shows your series alongside standalone videos.
>
> **Picks up where you left off** — close the app mid-video and the next time you open that video, you'll be asked if you want to resume from where you stopped.
>
> **A faster, cleaner app** — virtualization on the Explore page, smoother scrolling, fewer loading spinners.
>
> Questions? Reach us at support@streamly.in.

---

## Play Store "What's new" — long (≤ 4000 chars)

> **Welcome to Streamly v0.7.0 — our biggest update yet.**
>
> **A new player that respects your time**
> - Quality picker (480p / 720p / 1080p) — your choice is saved for next time.
> - Playback speed from 0.5× to 2×, with 0.25× steps.
> - Tap or drag the progress bar to jump to any point.
> - Double-tap the left or right edge of the video to skip back / forward 10 seconds.
> - Rotate your phone — the video rotates with you, in either portrait or landscape.
> - Auto-rotates are now unlocked, so the player uses the full screen in landscape.
>
> **Series, done right**
> - Upload multiple episodes at once, name the series once, and Streamly will group them.
> - Each series gets its own section on your channel page.
> - The Explore page now shows series alongside standalone videos, so your binge-watchers can find the next episode easily.
>
> **Resume, but smarter**
> - Close the app mid-video, come back later, and you'll see "Resume from 1:23" instead of starting over.
> - Already finished the video? No resume prompt — just press play.
>
> **Upload queue**
> - Pick 3 videos from your gallery, set titles and tags, and upload them all in one go.
> - Free users can queue up to 5 pending uploads; Premium users have no cap.
> - Cancel or retry an individual upload without losing the others.
>
> **Subscription**
> - Premium plans are now available — pay via UPI and get ad-free playback, unlimited uploads, and series collections.
> - Subscriptions are managed manually for now: pay via your UPI app, send us a screenshot, and we'll activate your plan within 24 hours.
>
> **Performance & polish**
> - Virtualized scrolling on Explore — even a feed of 1000 videos scrolls smoothly.
> - Smaller, sharper thumbnails using expo-image.
> - Less loading, more playing.
>
> **For channel owners**
> - The "Add Content" button now takes you straight to the upload form.
> - Manage your channel's content (approve, reject, feature) from the admin dashboard.
>
> **Bug fixes**
> - Fixed an issue where series names wouldn't propagate to new episodes.
> - Fixed an admin-only crash when a free admin viewed a premium post.
> - Fixed the player controls flickering during gestures.
> - Fixed the upload queue losing progress if the app was backgrounded.
>
> **What we know is rough (and fixing soon)**
> - The settings panel in the player doesn't close when you tap outside it — tap the ⚙ button again to close.
> - In-app purchases through Google Play aren't enabled yet — the UPI flow is the only way to subscribe in v0.7.0.
>
> **Privacy & data**
> - We don't use third-party analytics, advertising, or crash reporting in v0.7.0.
> - We don't share your data with anyone.
> - You can delete your account and all your data at any time from Settings.
> - Read the full privacy policy at https://streamly-legal.vercel.app/privacy-policy.
>
> **Got feedback?** Email us at support@streamly.in or find us on the channel page in the app. We read every message.

---

## Developer release notes (internal, not on Play Store)

### Headline features

1. **Player rewrite (`components/VideoPlayerOverlay.tsx`)** — `nativeControls={false}`, custom bottom row (play/pause + tappable progress bar + time), PanResponder-based double-tap skip on edge strips (left=-10s, right=+10s), single-tap settings toggle, settings panel with Quality (480/720/1080) and Speed (0.5/0.75/1/1.25/1.5/1.75/2×) chips, top-bar close (✕) and settings (⚙), episode navigation (← Prev / Next →) when on a series. Resume overlay via `useResumePosition` hook (sees `watch_history.last_position_seconds`). Player prefs persist via `PlayerPrefsService` (new in v0.7.0, table `user_preferences`).
2. **Auto-rotate** — removed `android:screenOrientation="portrait"` from `AndroidManifest.xml` main activity, and the player calls `ScreenOrientation.unlockAsync()` on mount / `lockAsync(PORTRAIT_UP)` on close.
3. **Series support** — `series_id` is now a TEXT column (was UUID in earlier designs, changed in v44 migration). Auto-fill from a previous episode in the same series when adding new content (`app/upload/add-content.tsx`). Series appear as their own section in the channel page and on Explore.
4. **Multi-entry upfront upload form** — `app/upload/add-content.tsx` is now a full form (not a one-at-a-time queue). The queue is for the upload manager only, with retry/cancel per entry. Free users capped at 5 pending uploads; Premium uncapped. Queue survives app backgrounding via `lib/uploadQueue.persistence.ts` + AsyncStorage.
5. **Explore virtualization** — `app/(tabs)/explore.tsx` now uses FlatList with `removeClippedSubviews`, memoized `SectionCard`/`SectionBlock`, and `expo-image` (not the default RN Image). Tested on a 1000-item feed — smooth 60fps scroll.
6. **Subscription model** — UPI-only manual flow (no Play Billing in v0.7.0). `subscription_plans`, `subscription_requests` tables; `approve_subscription_request` RPC (SECURITY DEFINER, admin check inside body); admin UI at `app/admin/subscription-requests.tsx`; user UI at `app/my-subscription.tsx`. Verified end-to-end by user on 2026-08-03 with a real payment.
7. **Player prefs persistence** — `user_preferences` table (own-row RLS, v42 migration) + `lib/services/playerPrefs.ts` service. Default quality + default speed saved per user, applied to next play. Survives app uninstall? No — wiped with the app. Survives logout? Yes, keyed on `userId` not device.

### Bug fixes (since v0.6.0)

| ID | Area | Description | Commit |
|---|---|---|---|
| bugfix4 | Admin gate | Admins no longer blocked by the paid gate on Explore | `027aeb1` |
| bugfix4 | Thumbnail | `thumbnail` no longer thrown in `updateEntry` when source has no thumbnail | `027aeb1` |
| bugfix4 | Series column | `series_id` is a TEXT column (not UUID) so app-supplied series names work | `027aeb1`, finalized in v44 migration |
| bugfix4 | Queue metadata | Queue entries carry their own `content_type` so the manager doesn't have to re-derive it | `027aeb1` |
| bugfix4 | RLS | `channel-media` storage bucket policies verified end-to-end | `027aeb1` (v43 migration) |
| bugfix5 | DB type | `series_id` UUID → TEXT (v44 migration) | `commit preceding 56544e0` |
| bugfix5 | UX | Retired the old `CreateModal` in favor of the always-visible `+Add Content` button | same |
| bugfix5 | Series auto-fill | Pre-fills series name + type when adding a new episode to an existing series | same |
| bugfix5 | Sections | Channel page and Explore now render dedicated sections per content type (series, single, live) | same |
| bugfix5 | Subscription | `user_subscription_status` view replaced by per-table reads in `iapHelpers` + direct profile reads | same |
| bugfix6 | Live auto-fill | `updateEntry` propagates series name to live-stream entries (was missing for the live content type) | `preceding d23a19c` |
| bugfix7 | Player gestures | Switched from RNGH to `PanResponder` for double-tap skip — RNGH was conflicting with `nativeControls` | `56544e0` |
| bugfix7 | Settings layout | Settings panel now fits on screen with both Quality and Speed rows visible | `d23a19c` |
| bugfix7 | Quality picker | 3-option picker (480/720/1080), applied on next play (expo-video can't hot-swap HLS renditions in 6.x) | `d23a19c` |
| bugfix7 | Single settings button | Removed the duplicate ⚙ in the bottom row — only the top bar has it now | `0368f41` |
| bugfix7 | Auto-rotate | Removed `android:screenOrientation="portrait"` from the main activity | `0368f41` |
| bugfix8 | Series name check | `e.seriesName === source.seriesName` was too strict for prefix-synced entries — changed to allow prefix | `preceding d4e047e` |
| bugfix8 | Explore virtualization | FlatList + memoized `SectionCard`/`SectionBlock` + `expo-image` | same |
| bugfix8 | Console cleanup | `console.error` in `app/(tabs)/explore.tsx` gated behind `__DEV__` (one-line fix, `git hash-object` staged to avoid sweeping WIP) | `d4e047e` |
| bugfix9 | Rate limit | `generate-stream-upload` rate-limited to 10/min/user (v45 migration adds `upload_rate_limit_log` table) | `b31ad76` |
| bugfix9 | RLS audit | Verified RLS on every table; `content_reports` admin-read is the only documented gap | `b31ad76` |
| bugfix9 | UPI env | `UPI_ID` now overridable via `EXPO_PUBLIC_UPI_ID` with `app.json` fallback | `b31ad76` |
| bugfix9 | Console gating | 15 files' `console.log`/`console.error` calls gated behind `__DEV__` | `b31ad76` |
| bugfix10 | DB cleanup script | `supabase/cleanup/2026-08-03-remove-test-data.sql` — manual run only, requires backup first | `17fd4d2` |

### Security & privacy

- **RLS audit** complete across all 30+ migrations. Every table holding user/PII/payment data has RLS enabled. The two RLS-less tables (`stream_videos`, `upload_rate_limit_log`) are deliberate service-role-only with no client GRANTs. See `docs/security-audit-v0.7.0.md`.
- **`payment-screenshots` bucket** verified: owner-only read/write scoped by folder prefix, admin read, no public access. Bucket `public: false`.
- **15 client-side files** have `console.*` calls gated behind `__DEV__` so nothing prints in release builds.
- **`SENTRY_DSN` is blank** in `app.json` — no crash reporting SDK is bundled. (Add Sentry in v0.7.1.)
- **AdMob IDs are blank** in `app.json` — no advertising SDK is bundled.
- **`IAP_PROVIDER: "noop"`** — no in-app purchase provider; the only payment path is manual UPI.

### Known limitations (acceptable for v0.7.0, tracked for v0.7.1)

1. Player settings panel doesn't dismiss on outside tap — tap ⚙ again. (See `components/VideoPlayerOverlay.tsx:259` — the panel has no onRequestClose.)
2. Player controls don't auto-hide — top bar and bottom row are persistently visible. (No timer in the component.)
3. Quality change is advisory — saved for next play, doesn't hot-swap HLS renditions. (expo-video 6.x doesn't expose `selectedVideoTrack`.)
4. Long-press to scrub was dropped — conflicts with native controls. Workaround: tap or drag the progress bar.
5. Subtitles table exists (v42) but the player doesn't render them yet. (See `docs/payment-flow-v0.7.0.md` §8 limitations for full list of payment-flow limitations.)
6. Background upload survival on Android isn't wired — if the user backgrounds the app during upload, the OS can kill the JS context. Foreground uploads complete reliably.
7. **No push notifications** — admin doesn't get notified when a new subscription request comes in. Admin must open the app and check.
8. **No automated plan expiry** — `profiles.plan_expires_at` is set on approval but not enforced by a cron. Plans stay 'active' until manually changed.
9. **Session storage on Android is in `AsyncStorage`, not Keystore** — v0.7.1 will switch to `expo-secure-store`.

### Database migrations applied for v0.7.0

| Migration | Purpose | Status |
|---|---|---|
| `20260721120000_v42_player_prefs.sql` | `user_preferences` table, `subtitles` table, `watch_history.duration_seconds` + `completed` + `last_watched_at` | Applied |
| `20260723120000_v44_series_id_to_text.sql` | `series_id` UUID → TEXT | Applied |
| `20260803120000_v45_upload_rate_limit_log.sql` | `upload_rate_limit_log` table for `generate-stream-upload` rate limiting | Applied via "Run without RLS" (orange button), service-role only |

### Migrations to apply post-launch (not blocking)

- None for v0.7.0 launch. The `cleanup/2026-08-03-remove-test-data.sql` is a **manual one-time cleanup** script, not a migration; the user runs it via SQL editor after backup.

### What the user must do before submitting to Play Store

1. Run `npx eas build --platform android --profile production` to produce the AAB.
2. Upload to Play Console Internal Testing first (per the v0.6.0 precedent — Internal Testing → Production after tester feedback).
3. Fill in the Data Safety form using `docs/play-store-data-safety.md`.
4. Add release notes (short version at the top of this doc).
5. Update screenshots in Play Console (the v0.6.0 screenshots are stale; v0.7.0 has the new player, new upload form, new series sections).
6. Confirm the privacy policy URL (`https://streamly-legal.vercel.app/privacy-policy`) returns 200 and is the v0.7.0 version per the outline (`docs/privacy-policy-outline.md`).
7. Confirm the Grievance Officer is named and reachable (DPDPA requirement, see `docs/privacy-policy-outline.md` §13).
8. Submit for review.

### Out of scope for v0.7.0 (filed as v0.7.1 backlog)

- Picture-in-picture support (the prop is set on `VideoView` but the UI flow isn't tested).
- Subtitle rendering in the player.
- Sentry crash reporting.
- Google Play Billing (so the manual UPI flow can be replaced with auto-renewing subs).
- Push notifications (Expo Push) for admin alerts.
- pg_cron job for plan expiry.
- Android Keystore-backed session storage.
- Background upload survival (Android foreground service).
- Auto-hide for player controls.
- Outside-tap dismiss for the settings panel.
- App-icon A/B testing (graphic design has 4 variants; pick the winner in v0.7.1).
