-- v54: Premium video playback lockdown support.
--
-- Cloudflare Stream only enforces signed playback on a video that has
-- requireSignedURLs=true set on it. The new `stream-playback-token` edge
-- function sets that flag the first time it mints a token for a premium
-- post's video, then records it here so it can skip straight to token-minting
-- on every subsequent request (one Cloudflare call instead of two).
--
-- This is a cache of Cloudflare-side state, not the source of truth — the
-- function PATCHes requireSignedURLs=true (idempotent) whenever this column
-- is not already true, so a stale/false value only costs one extra API call,
-- never a security gap.
--
-- Nothing here changes free video playback: free posts never call the new
-- function and their videos are never locked.

ALTER TABLE public.stream_videos
  ADD COLUMN IF NOT EXISTS signed_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stream_videos.signed_locked IS
  'True once stream-playback-token has confirmed requireSignedURLs=true on this Cloudflare Stream video. Cache only; the function re-asserts the flag when this is false.';

-- Fast lookup by UID alone (the function has the post''s video_url / Stream
-- UID, not the (user_id, stream_uid) pair the existing unique index needs).
CREATE INDEX IF NOT EXISTS idx_stream_videos_stream_uid ON public.stream_videos(stream_uid);
