-- Migration v37: Allow everyone (including free users) to see approved shorts
-- in active public channels, without requiring channel membership.
--
-- CONTEXT: The existing "Channel posts visible to members + paid users" policy
-- requires channel_members membership (or admin / paid ad_attributed) to SELECT
-- channel_posts. Free users who haven't joined any channel see nothing in
-- Explore, which breaks the paywall model where free users should see shorts
-- (is_short=true) as their entry point.
--
-- This adds a parallel PERMISSIVE policy. PostgREST ORs multiple permissive
-- policies for the same operation, so existing access (members, admins, paid
-- ad_attributed) is unchanged. This policy adds: any authenticated user can
-- SELECT approved shorts whose channel is public + active.

CREATE POLICY "Public shorts visible to all users"
  ON public.channel_posts
  FOR SELECT
  TO authenticated, anon
  USING (
    status = 'approved'
    AND is_short = true
    AND EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_posts.channel_id
        AND c.is_public = true
        AND c.status = 'active'
    )
  );

NOTIFY pgrst, 'reload schema';