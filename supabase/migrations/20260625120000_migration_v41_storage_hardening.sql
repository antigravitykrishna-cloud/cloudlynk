-- v41: Storage hardening — track Cloudflare Stream UIDs, tighten channel-media policies,
-- fix user-files role, document dashboard-only bucket configs.
--
-- Apply via: npx supabase db push --linked

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1) stream_videos tracking table
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.stream_videos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stream_uid   text NOT NULL,
  context      text NOT NULL,                  -- 'post_video', 'post_trailer', etc.
  post_id      uuid REFERENCES public.channel_posts(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_videos_user_id ON public.stream_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_stream_videos_post_id  ON public.stream_videos(post_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_videos_user_uid ON public.stream_videos(user_id, stream_uid);

COMMENT ON TABLE public.stream_videos IS
  'Tracks Cloudflare Stream UIDs per user so delete-account can clean them up. Service-role writes only.';

-- No RLS: internal tracking table. Writes from edge functions (service role) only.
-- Clients never read this directly.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2) Backfill stream_videos from existing channel_posts
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Real Cloudflare Stream UIDs are 32-character lowercase hex strings.
-- Skip test artifacts like 'fk-test-uid' and 'manual-test-uid-123'.

INSERT INTO public.stream_videos (user_id, stream_uid, context, post_id)
SELECT DISTINCT ON (cp.author_id, cp.video_url)
  cp.author_id,
  cp.video_url,
  'post_video',
  cp.id
FROM public.channel_posts cp
WHERE cp.video_url IS NOT NULL
  AND cp.video_url ~ '^[a-f0-9]{32}$'
  AND cp.author_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.stream_videos sv
    WHERE sv.user_id = cp.author_id
      AND sv.stream_uid = cp.video_url
  )
ORDER BY cp.author_id, cp.video_url, cp.created_at DESC;

-- Backfill trailer_url too (currently all NULL in project, but future-proof).
INSERT INTO public.stream_videos (user_id, stream_uid, context, post_id)
SELECT DISTINCT ON (cp.author_id, cp.trailer_url)
  cp.author_id,
  cp.trailer_url,
  'post_trailer',
  cp.id
FROM public.channel_posts cp
WHERE cp.trailer_url IS NOT NULL
  AND cp.trailer_url ~ '^[a-f0-9]{32}$'
  AND cp.author_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.stream_videos sv
    WHERE sv.user_id = cp.author_id
      AND sv.stream_uid = cp.trailer_url
  )
ORDER BY cp.author_id, cp.trailer_url, cp.created_at DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3) Tighten channel-media INSERT policy — add path-prefix guard
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP POLICY IF EXISTS "Auth users upload channel media" ON storage.objects;
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

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4) Add channel-media admin full-access policy
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP POLICY IF EXISTS "channel-media admin full access" ON storage.objects;

CREATE POLICY "channel-media admin full access"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'channel-media'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    bucket_id = 'channel-media'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5) Fix user-files policy role: {public} → {authenticated}
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP POLICY IF EXISTS "Users access own storage folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users access own storage folder" ON storage.objects;

CREATE POLICY "Authenticated users access own storage folder"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'user-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'user-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6) Document the dashboard-created buckets (user-files + channel-media)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- These were created via the Supabase dashboard with no prior migration.
-- ON CONFLICT makes this idempotent — no-op if buckets already exist (which they do).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('user-files', 'user-files', false, 1073741824,
   ARRAY['image/jpeg','image/png','image/gif','image/webp','image/heic',
         'video/mp4','video/quicktime','video/x-msvideo','video/webm',
         'audio/mpeg','audio/wav','audio/ogg','audio/mp4',
         'application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/zip','application/x-zip-compressed',
         'text/plain','text/csv','application/octet-stream']::text[]),
  ('channel-media', 'channel-media', true, 104857600,
   ARRAY['image/jpeg','image/png','image/gif','image/webp',
         'video/mp4','video/quicktime','video/webm']::text[])
ON CONFLICT (id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PostgREST schema reload
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTIFY pgrst, 'reload schema';
