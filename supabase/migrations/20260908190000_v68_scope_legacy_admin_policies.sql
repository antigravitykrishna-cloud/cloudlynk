-- ═══════════════════════════════════════════════════════════════════════════
-- v68 — HOTFIX 4: scope legacy admin SELECT policies to authenticated
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Four policies predating guest browsing were created without a TO clause, so
-- they apply to PUBLIC — which includes anon:
--
--   channels        "Admins see all channels"
--   channel_members "Admins see all channel members"
--   channel_videos  "Admins can read all videos"
--   content_reports "Admins can view all content reports"
--
-- Each is `EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
-- AND is_admin)`. Two things follow.
--
-- 1. They can never grant a guest anything. auth.uid() is NULL for anon, so
--    the EXISTS is always false. They are dead weight on that role.
--
-- 2. They still get EVALUATED, and evaluating them reads public.profiles,
--    where anon holds only a narrow column grant. That raises
--    42501 permission denied — and a policy that ERRORS aborts the statement
--    rather than evaluating to false, so ORing with a permissive anon policy
--    does not rescue it.
--
-- The visible symptom was every guest read of channel_posts returning HTTP
-- 500/401: the anon policy reads channels, which dragged the channels admin
-- policy in behind it. Explore was empty for signed-out users.
--
-- Bodies are unchanged. The only edit is TO authenticated.

BEGIN;

DROP POLICY IF EXISTS "Admins see all channels" ON public.channels;
CREATE POLICY "Admins see all channels"
  ON public.channels FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

DROP POLICY IF EXISTS "Admins see all channel members" ON public.channel_members;
CREATE POLICY "Admins see all channel members"
  ON public.channel_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

DROP POLICY IF EXISTS "Admins can read all videos" ON public.channel_videos;
CREATE POLICY "Admins can read all videos"
  ON public.channel_videos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

DROP POLICY IF EXISTS "Admins can view all content reports" ON public.content_reports;
CREATE POLICY "Admins can view all content reports"
  ON public.content_reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

COMMIT;
