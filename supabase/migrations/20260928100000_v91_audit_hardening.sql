-- v91: audit follow-ups, 2026-09-28.
--
-- 1. channel-media is a PUBLIC bucket and every signed-in user may upload to
--    their own folder in it (for a profile photo). It accepted videos up to
--    100 MB, so any account could host public videos on our storage and
--    bandwidth -- the exact "users publish content" the client ruled out.
--    Every object in it today is an image (videos go to Cloudflare Stream),
--    so it becomes images only, 10 MB.
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'],
       file_size_limit    = 10485760
 WHERE id = 'channel-media';

-- 2. Security advisor: functions with a role-mutable search_path.
ALTER FUNCTION public.current_policy_versions() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.user_files_owner(text) SET search_path = public;
