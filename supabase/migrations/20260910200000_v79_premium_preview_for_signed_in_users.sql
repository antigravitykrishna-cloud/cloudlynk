-- v79: let signed-in non-subscribers see the locked premium catalogue.
--
-- Applied to production via the Supabase MCP; recorded here so the repo and
-- the database stay in step.
--
-- The funnel ran backwards. A guest sees every premium post locked -- title,
-- thumbnail, genre, no video_url, because the column GRANT withholds it from
-- anon -- and v61 calls that "the signup incentive". The moment that guest
-- creates an account, channel_posts_select_v57 filters those rows out, because
-- its entitlement branch admits only free posts, active plans and explicit
-- grants. So the person who has just shown the most intent sees the least, and
-- the brief's "user can only see preview content, full content stays locked"
-- was not met for signed-in free users.
--
-- Nobody designed that. v61 added guest browsing on top of a policy set that
-- already had the v57 entitlement test, and the two were never reconciled.
--
-- Fixed additively rather than by relaxing the policy. Relaxing it is the
-- obvious move and it is wrong: RLS is row-level, so admitting the row admits
-- every column the role can read, and `authenticated` IS granted video_url.
-- Signed-in free users would get the Stream UID of every premium video. v57
-- makes premium videos requireSignedURLs=true so a bare UID should not play --
-- but STATUS.md finding 2 is precisely the case where that guarantee lapsed
-- ("premium videos served unsigned until first play"), and a defence that has
-- already failed once should not be the only defence.
--
-- So: a view that physically cannot return a playable identifier. Same shape
-- as free_post_media (v63), opposite selection. channel_posts_select_v57 is
-- untouched, and nothing about how playback resolves changes.
--
-- Verified after applying, simulating a real authenticated session for an
-- expired non-admin subscriber: 25 premium previews visible, and still 0
-- premium rows readable directly from channel_posts. View column list
-- contains no video_url / media_url / trailer_url.

CREATE OR REPLACE VIEW public.premium_preview AS
  SELECT
    p.id, p.channel_id, p.author_id, p.title, p.body, p.content_type,
    p.access_level, p.genre, p.duration_min, p.release_year,
    p.season_number, p.episode_number, p.episode_title, p.series_id,
    p.tags, p.media_type, p.thumbnail_url, p.is_short, p.view_count,
    p.status, p.created_at
  FROM public.channel_posts p
  JOIN public.channels c ON c.id = p.channel_id
  WHERE p.access_level = 'premium'
    AND p.status = 'approved'
    AND c.is_public = true
    AND c.status = 'active'
    -- A suspended or banned creator's work stays hidden here too, matching
    -- every other read path.
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles ap
      WHERE ap.id = p.author_id AND ap.account_status <> 'active'
    )
    -- Respect the viewer's block list. A definer view can still read
    -- auth.uid(), so this stays per-viewer rather than global.
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE b.blocker_id = auth.uid() AND b.blocked_id = p.author_id
    );

-- SELECT only, and only for signed-in users. anon does not need it: guests
-- already reach these rows through channel_posts_select_anon.
REVOKE ALL   ON public.premium_preview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.premium_preview TO authenticated;

COMMENT ON VIEW public.premium_preview IS
  'Locked premium catalogue for signed-in non-subscribers (v79). Metadata only -- video_url and media_url are absent from the view by construction, so this cannot leak a playable identifier no matter who queries it. Mirrors free_post_media (v63) with the opposite selection. Entitled reads still go through channel_posts_select_v57, which is unchanged.';

NOTIFY pgrst, 'reload schema';
