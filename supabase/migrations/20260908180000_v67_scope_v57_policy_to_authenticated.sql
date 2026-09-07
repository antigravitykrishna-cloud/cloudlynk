-- ═══════════════════════════════════════════════════════════════════════════
-- v67 — HOTFIX 3: scope the signed-in SELECT policy to authenticated
-- ═══════════════════════════════════════════════════════════════════════════
--
-- channel_posts_select_v57 was created without a TO clause, so it applies to
-- PUBLIC — which includes anon. Postgres evaluates EVERY permissive policy
-- that applies to the role and ORs the results, so an anon SELECT still ran
-- the v57 expression, which reads public.profiles directly:
--
--   EXISTS (SELECT 1 FROM public.profiles vp WHERE vp.id = auth.uid() ...)
--
-- anon holds only a narrow column grant on profiles (id, full_name,
-- avatar_url, username — email and account_status withheld), so evaluating it
-- raised 42501 permission denied and the whole read failed, even though
-- channel_posts_select_anon would have allowed the row.
--
-- ORing does not save you here: a policy that ERRORS aborts the statement, it
-- does not evaluate to false. So the fix is to stop anon evaluating it at all.
--
-- The policy body is carried over verbatim from v57. The ONLY change is
-- `TO authenticated`. Guests are served by channel_posts_select_anon (v61,
-- rewritten in v66); every one of the conditions below is about a signed-in
-- viewer — auth.uid()'s account standing, their blocks, their membership,
-- their entitlement — and none of them mean anything for anon.

BEGIN;

DROP POLICY IF EXISTS channel_posts_select_v57 ON public.channel_posts;

CREATE POLICY channel_posts_select_v57
  ON public.channel_posts FOR SELECT
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
    OR (
      status = 'approved'
      AND EXISTS (
        SELECT 1 FROM public.profiles vp
        WHERE vp.id = auth.uid() AND vp.account_status = 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles ap
        WHERE ap.id = channel_posts.author_id AND ap.account_status <> 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE b.blocker_id = auth.uid() AND b.blocked_id = channel_posts.author_id
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.channel_members
          WHERE channel_members.channel_id = channel_posts.channel_id
            AND channel_members.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.channels
          WHERE channels.id = channel_posts.channel_id
            AND channels.is_public = true
            AND channels.status = 'active'
        )
      )
      AND (
        access_level = 'free'
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.plan_status IN ('active', 'lifetime')
        )
        OR public.has_content_access(channel_posts.id, auth.uid())
      )
    )
  );

COMMIT;
