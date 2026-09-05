-- v42_player_prefs: watch_history extensions + user_preferences + subtitles
-- Phase 2 schema for v0.7.0 long-content player (resume, quality, speed, subtitles)
-- Date: 2026-07-21

-- ============================================================
-- watch_history: add missing columns (code already references them)
-- ============================================================
-- useWatchHistory.ts references duration_seconds, completed, last_watched_at
-- but BACKEND_REFERENCE only documents progress_seconds + watched_at.
-- These columns may or may not exist — ADD IF NOT EXISTS is safe either way.
-- If they already exist: no-op. If missing: fixes latent bug where
-- "Continue Watching" queries silently return null for these fields.

ALTER TABLE public.watch_history ADD COLUMN IF NOT EXISTS duration_seconds INT;
ALTER TABLE public.watch_history ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false;
ALTER TABLE public.watch_history ADD COLUMN IF NOT EXISTS last_watched_at TIMESTAMPTZ DEFAULT now();

-- Index for "Continue Watching" row on explore — sorts by recency, filters incomplete.
-- Without this, the query table-scans once watch_history grows past a few hundred rows.
CREATE INDEX IF NOT EXISTS idx_watch_history_user_last_watched
  ON public.watch_history (user_id, last_watched_at DESC)
  WHERE completed = false;

-- ============================================================
-- user_preferences: per-user player settings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_quality TEXT DEFAULT 'auto',
  default_speed NUMERIC DEFAULT 1.0,
  default_subtitle_language TEXT DEFAULT 'off',
  auto_play_next_episode BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own prefs" ON public.user_preferences;
CREATE POLICY "Users manage own prefs" ON public.user_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on every write (matches handle_updated_at pattern used by other tables)
CREATE OR REPLACE FUNCTION public.handle_user_prefs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_prefs_updated_at ON public.user_preferences;
CREATE TRIGGER trg_user_prefs_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_prefs_updated_at();

-- ============================================================
-- subtitles: WebVTT sidecar tracks linked to channel_posts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subtitles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.channel_posts(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(video_id, language)
);

ALTER TABLE public.subtitles ENABLE ROW LEVEL SECURITY;

-- Anyone can read subtitles for approved content
DROP POLICY IF EXISTS "Subtitles readable by all" ON public.subtitles;
CREATE POLICY "Subtitles readable by all" ON public.subtitles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_posts
      WHERE id = subtitles.video_id AND status = 'approved'
    )
  );

-- Channel owners and admins can insert/update/delete subtitles for their content
DROP POLICY IF EXISTS "Channel owners can manage subtitles" ON public.subtitles;
CREATE POLICY "Channel owners can manage subtitles" ON public.subtitles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_posts cp
      JOIN public.channels c ON c.id = cp.channel_id
      WHERE cp.id = subtitles.video_id
        AND (
          c.owner_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.channel_posts cp
      JOIN public.channels c ON c.id = cp.channel_id
      WHERE cp.id = subtitles.video_id
        AND (
          c.owner_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
        )
    )
  );

-- ============================================================
-- Reload PostgREST schema cache (REQUIRED — every migration ends with this)
-- ============================================================
NOTIFY pgrst, 'reload schema';
