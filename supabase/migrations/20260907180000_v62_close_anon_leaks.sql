-- v62: close three things a signed-out visitor can read in production today.
--
-- Found by running scripts/verify-guest-access.mjs against production with the
-- anon key and no session — which is exactly what anyone who installs the APK
-- holds, since the anon key ships inside it. These are NOT introduced by the
-- guest-browsing work; they are live now.
--
--   stream_videos              48 rows fully readable, including user_id,
--                              stream_uid, post_id and signed_locked
--   channel_posts.video_url    readable — 13 free posts have one
--   channel_posts.media_url    readable
--
-- ═══════════════════════════════════════════════════════════════
-- 1. stream_videos — RLS was never enabled
-- ═══════════════════════════════════════════════════════════════
--
-- BACKEND_REFERENCE and the v54 notes both describe this table as
-- "service-role only; clients never touch it". The application side of that is
-- true — nothing in app/ or lib/ queries it. But "no client code reads it" was
-- being relied on as the control, and it is not one: the table is reachable
-- over PostgREST by anyone with the anon key, and RLS was never switched on.
--
-- What it discloses: every Cloudflare Stream UID in the product, mapped to the
-- user who uploaded it and the post it belongs to. A UID plus
-- videodelivery.net/<uid>/manifest/video.m3u8 plays any video that is not
-- signed-locked — which, before v57 locked videos at upload, is most of them.
-- signed_locked is in the row too, so the table conveniently says which ones.
--
-- Belt and braces: enable RLS, and revoke the grants as well. Either alone
-- would do; both means neither a forgotten policy nor a future GRANT re-opens
-- it silently.

ALTER TABLE public.stream_videos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stream_videos FROM anon, authenticated;

-- No policy is created on purpose. RLS with zero policies denies everything to
-- everyone except the service role, which bypasses RLS entirely — and the
-- service role is the only thing that should ever touch this table. This is the
-- same shape v56 already uses for admin_audit_log.
COMMENT ON TABLE public.stream_videos IS
  'Cloudflare Stream UID tracking. service_role ONLY: RLS is enabled with zero policies and no role holds a grant. Before v62 this table was readable by anon over PostgREST — 48 rows, exposing every stream UID mapped to its uploader and post. Do not add a policy or a grant here; the edge functions use the service-role key and need neither.';

-- ═══════════════════════════════════════════════════════════════
-- 2. channel_posts — the media identifiers
-- ═══════════════════════════════════════════════════════════════
--
-- v61 already fixes this as a side effect of scoping guest browsing (it
-- REVOKEs ALL from anon, then grants presentation columns only). Repeated here
-- so the fix does not depend on the order the two migrations are applied in,
-- and so this file stands alone if v61 is ever reverted.
--
-- video_url is the Cloudflare UID; media_url is the Storage path. Either one
-- lets a visitor fetch content the app asks them to sign in for.

REVOKE ALL ON public.channel_posts FROM anon;

GRANT SELECT (
  id, channel_id, author_id, title, body,
  content_type, access_level, genre, duration_min,
  release_year, season_number, episode_number, episode_title,
  series_id, tags, media_type, thumbnail_url, is_short,
  view_count, status, created_at
) ON public.channel_posts TO anon;

-- ═══════════════════════════════════════════════════════════════
-- 3. Verify, do not assume
-- ═══════════════════════════════════════════════════════════════
--
-- A GRANT to anon is only safe while RLS is ENABLED on the table. With RLS off,
-- the grant alone exposes every row and the policies read perfectly while
-- protecting nothing — which is exactly how stream_videos ended up open.
--
-- This raises rather than warns: applying a migration that hands anon column
-- grants on a table with RLS disabled would make things worse, not better.
DO $mig$
DECLARE
  unprotected text;
BEGIN
  SELECT string_agg(relname, ', ')
    INTO unprotected
    FROM pg_class
   WHERE relname IN ('channel_posts', 'channels', 'profiles', 'stream_videos')
     AND relnamespace = 'public'::regnamespace
     AND relrowsecurity = false;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION
      'RLS is DISABLED on: %. Column grants do not restrict rows — enable RLS before granting anything to anon.',
      unprotected;
  END IF;
END $mig$;

NOTIFY pgrst, 'reload schema';
