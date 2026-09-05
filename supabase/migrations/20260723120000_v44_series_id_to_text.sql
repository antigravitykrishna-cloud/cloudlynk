-- v44: Change channel_posts.series_id from UUID to TEXT
--
-- series_id is used for soft-grouping episodes under a series label.
-- There is no series table — the ID is a client-generated slug-hash string.
-- UUID type rejects these strings with "invalid input syntax for type uuid".
-- TEXT fits the model: no FK, no UUID constraint, just a grouping label.
--
-- Apply via Supabase dashboard → SQL editor.

ALTER TABLE public.channel_posts
  ALTER COLUMN series_id TYPE text USING series_id::text;

NOTIFY pgrst, 'reload schema';
