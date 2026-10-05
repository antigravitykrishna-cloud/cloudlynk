-- ============================================================
-- JOLLIFY MIGRATION V5 — Content Metadata for Netflix UI
-- Run this in Supabase SQL Editor AFTER migration_v4.sql
-- ============================================================

-- Add content metadata to channel_posts
ALTER TABLE public.channel_posts
  ADD COLUMN IF NOT EXISTS content_type    TEXT DEFAULT 'post'
    CHECK (content_type IN ('post', 'movie', 'series', 'short')),
  ADD COLUMN IF NOT EXISTS thumbnail_url   TEXT,       -- storage path in channel-media bucket
  ADD COLUMN IF NOT EXISTS genre           TEXT,       -- e.g. 'Action', 'Comedy', 'Drama', 'Thriller'
  ADD COLUMN IF NOT EXISTS duration_min    INTEGER,    -- runtime in minutes
  ADD COLUMN IF NOT EXISTS season_number   INTEGER,    -- for series
  ADD COLUMN IF NOT EXISTS episode_number  INTEGER,    -- for series
  ADD COLUMN IF NOT EXISTS episode_title   TEXT,       -- e.g. "Episode 1: The Beginning"
  ADD COLUMN IF NOT EXISTS trailer_url     TEXT,       -- optional trailer storage path
  ADD COLUMN IF NOT EXISTS release_year    INTEGER,
  ADD COLUMN IF NOT EXISTS tags            TEXT[];     -- e.g. ['action', 'thriller']

-- Index for browsing by content type within a channel
CREATE INDEX IF NOT EXISTS channel_posts_content_type_idx
  ON public.channel_posts(channel_id, content_type);

CREATE INDEX IF NOT EXISTS channel_posts_genre_idx
  ON public.channel_posts(genre);
