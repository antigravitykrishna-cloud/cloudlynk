-- v78: free_post_media should be readable, not writable.
--
-- Applied to production via the Supabase MCP; recorded here so the repo and
-- the database stay in step.
--
-- The view held the full grant set -- arwdDxtm -- for anon and authenticated:
-- INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER alongside SELECT.
-- It only ever needed SELECT.
--
-- Inert today. The view joins channel_posts to channels, which makes it
-- non-auto-updatable (information_schema.views reports is_updatable = NO), so
-- a write through it fails regardless of the grant.
--
-- The reason to fix it anyway is what happens on the day someone simplifies
-- the view. Drop the JOIN -- fold the channel test into a subquery, say -- and
-- Postgres silently makes it auto-updatable. The view is owned by postgres and
-- therefore runs with definer rights and bypasses RLS, so at that moment anon
-- would gain unrestricted INSERT/UPDATE/DELETE on channel_posts through it,
-- with nothing in the diff to suggest it. A refactor that looks like a
-- simplification would be a privilege escalation.
--
-- Grant only what is used. The view itself stays SECURITY DEFINER on purpose:
-- guest free playback (v63) depends on it returning video_url for FREE posts
-- without the caller being able to read the underlying column. Its WHERE
-- clause pins access_level = 'free', so premium media is not reachable through
-- it -- that is the control that matters, and it is unchanged here.
--
-- Verified after applying: relacl is anon=r/authenticated=r, and a join of the
-- view against channel_posts returns 0 rows with access_level <> 'free'.
--
-- The Supabase advisor flags this view as security_definer_view (ERROR). That
-- finding is understood and accepted, not overlooked: definer rights are the
-- entire mechanism behind guest free playback. Removing them would break it.

REVOKE ALL ON public.free_post_media FROM anon, authenticated;
GRANT SELECT ON public.free_post_media TO anon, authenticated;

COMMENT ON VIEW public.free_post_media IS
  'Guest free playback (v63). Returns media identifiers for approved FREE posts in public active channels by active authors. Definer-rights on purpose so a guest can play free content without SELECT on channel_posts.video_url; the access_level = ''free'' predicate is what keeps premium media out. SELECT-only since v78.';
