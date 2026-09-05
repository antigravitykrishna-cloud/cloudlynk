# Changelog

## v0.7.0 — Upload Queue + Long-Content Player Foundation (2026-07-21)

### Phase 1: Upload Queue
- **Multi-select video picker** (`lib/stream.ts`): New `pickVideos()` method uses `expo-document-picker` with `multiple: true`. Files over 180MB are flagged in the queue as `over_limit`.
- **Upload queue manager** (`lib/uploadQueue.ts`): Sequential foreground uploads via Cloudflare Stream → `PostService.createPost()`. Handles pause/resume, retry on failure, and persists queue state to AsyncStorage.
- **Queue persistence** (`lib/uploadQueue.persistence.ts`): AsyncStorage persistence layer (key: `upload_queue`). Survives app restarts; items stuck in `uploading` state on launch are reset to `queued`.
- **Queue React hook** (`hooks/useUploadQueue.ts`): Wraps the queue manager, respects premium limits (5 items free, unlimited for premium users), exposes `addToQueue`, `removeFromQueue`, `startUpload`, `pauseUpload`, etc.
- **Queue screen** (`app/upload/queue.tsx`): Lists queued items with status badges, progress bars, edit/remove/retry actions. Stats bar shows queued/done/failed/limit counts.
- **Per-item form** (`app/upload/form/[id].tsx`): Mirrors CreateModal fields — content type, title, description, genre, duration, season/episode numbers, thumbnail. "Save & next" skips to next queued item.
- **Channel integration**: "📤 Upload Queue" button added to channel detail screen (`app/(tabs)/channels/[id].tsx`) alongside the existing "+ Add Content" button.
- **Sign-out cleanup**: `useAuth.signOut()` now calls `UploadQueue.destroy()` to wipe the local queue.
- **Storage**: Queue state is local-only (AsyncStorage, not Postgres). `content://` URIs are useless server-side.

### Schema: v42_player_prefs (`20260721120000_v42_player_prefs.sql`)
- `watch_history`: Added `duration_seconds INT`, `completed BOOLEAN`, `last_watched_at TIMESTAMPTZ` (defensive — the TypeScript code already references these columns).
- `user_preferences`: New table — `default_quality`, `default_speed`, `default_subtitle_language`, `auto_play_next_episode`.
- `subtitles`: New table — tracks WebVTT files per `channel_posts` video. Public read on approved content; channel owners/admins can manage.

### Files created
- `lib/uploadQueue.ts`
- `lib/uploadQueue.persistence.ts`
- `hooks/useUploadQueue.ts`
- `app/upload/queue.tsx`
- `app/upload/form/[id].tsx`
- `supabase/migrations/20260721120000_v42_player_prefs.sql`

### Files modified
- `lib/stream.ts` — added `pickVideos()`, exported `STREAM_MAX_MB`
- `app/(tabs)/channels/[id].tsx` — added Upload Queue button + `useUploadQueue` import
- `hooks/useAuth.ts` — `signOut()` calls `UploadQueue.destroy()`
- `app.json` — version bumped to 0.7.0

### Deferred
- Background upload survival (Android foreground service)
- Phase 2 player enhancements (resume, quality, speed, subtitles, episode nav, buffering UX)

---

## Recent Updates

### 1. Explore Tab Added (`app/(tabs)/explore.tsx`)
- Created a brand new **Explore** page designed to let users organically discover content.
- Integrated Netflix-style horizontal swipeable rows for media content (grouped by Featured, Movies, Web Series, Shorts, and specific genres).
- **Data Aggregation**: Wrote a new data-fetching method (`getExplorePosts` in `lib/posts.ts`) that automatically aggregates content from two sources:
  1. All public, active "Discover" channels.
  2. Any private/public channels the user is explicitly subscribed to.
- Strictly filters the aggregated feed to only include posts with rich media (videos/images) to ensure the grid looks highly visual, hiding text-only announcements.
- Integrated the new `🔍 Explore` tab natively into the bottom tab bar navigation (`app/(tabs)/_layout.tsx`).

### 2. Files UI Layout Fix (`app/(tabs)/files.tsx`)
- **Redesigned Category Filter**: Replaced awkwardly stretched pill shapes with a clean, modern flat tab layout.
- **Fixed Vertical Spacing Bug**: Resolved an issue where an inherited stretching layout caused massive empty vertical spacing between the search bar and the tab list. Properly contained the ScrollView inside a fixed-border View.

### 3. Android Build Fixes
- Updated `android/local.properties` to ensure the local Gradle build correctly maps to the Android SDK directory, unblocking native local builds for testing the app in the Android Emulator.
