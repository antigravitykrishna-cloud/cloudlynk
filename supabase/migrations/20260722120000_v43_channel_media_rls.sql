-- v43: channel-media RLS hardening
-- Problem: thumbnail uploads from the upload queue were silently failing.
-- The INSERT policy path-prefix check requires folder[1] = auth.uid()::text,
-- which matches our upload path pattern ({userId}/{timestamp}.ext). This was
-- correct, but we were missing an explicit SELECT/public-read policy that lets
-- the app fetch thumbnails without signed URLs (bucket is public, but explicit
-- policy is needed for anon reads via the JS client).
--
-- Apply via Supabase dashboard → SQL editor.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1) Public read on channel-media (thumbnails, channel art)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP POLICY IF EXISTS "Public read channel media" ON storage.objects;

CREATE POLICY "Public read channel media"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'channel-media');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2) Ensure authenticated users can insert into their own folder
--    (re-assert v41 policy idempotently in case it was dropped)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP POLICY IF EXISTS "Auth users upload to own channel media folder" ON storage.objects;

CREATE POLICY "Auth users upload to own channel media folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'channel-media'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3) Allow authenticated users to delete their own objects
--    (needed for future cleanup / re-upload flows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP POLICY IF EXISTS "Auth users delete own channel media" ON storage.objects;

CREATE POLICY "Auth users delete own channel media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'channel-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';
