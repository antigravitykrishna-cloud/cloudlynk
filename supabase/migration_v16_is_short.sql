-- Migration v16: Add is_short column to channel_posts
-- Used by getExplorePosts to filter content for free users.
-- Default true so all existing posts are visible to free users.
-- Admin will set is_short = false on long-form content (movies, series).

ALTER TABLE channel_posts ADD COLUMN IF NOT EXISTS is_short BOOLEAN DEFAULT true;

-- Mark existing admin-seeded long content as NOT short
UPDATE channel_posts
SET is_short = false
WHERE content_type IN ('movie', 'series')
  AND is_short = true;
