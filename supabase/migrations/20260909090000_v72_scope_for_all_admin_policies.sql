-- ═══════════════════════════════════════════════════════════════════════════
-- v72 — Scope the remaining FOR ALL admin policies to authenticated
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Symptom: the Premium screen rendered "Select Your Plan" with no plans under
-- it for a signed-out visitor. GET /subscription_plans returned
-- 42501 "permission denied for table profiles".
--
-- Cause is the same shape v68 fixed, in policies v68 did not look at.
--
--   "Admins can write plans" ON subscription_plans
--     AS PERMISSIVE FOR ALL TO public
--     USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin))
--
-- FOR ALL includes SELECT, and TO public includes anon. So an anonymous read
-- of subscription_plans evaluated an expression that reads profiles, where
-- anon holds only a narrow column grant, and the statement aborted — even
-- though "Anyone can read active plans" would have allowed the row.
--
-- v68 missed these because its scan skipped any policy whose definition
-- contained a TO clause, on the assumption that meant "already role-scoped".
-- `TO public` has a TO clause and is not scoped: public includes anon. The
-- four policies v68 did fix simply had no TO clause at all.
--
-- Each is an admin check on auth.uid(), which is NULL for anon, so none of
-- them can ever grant a guest anything. They only error. Bodies unchanged;
-- the sole edit is TO authenticated.

BEGIN;

DROP POLICY IF EXISTS "Admins can write plans" ON public.subscription_plans;
CREATE POLICY "Admins can write plans" ON public.subscription_plans
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

DROP POLICY IF EXISTS "Admins can write app_settings" ON public.app_settings;
CREATE POLICY "Admins can write app_settings" ON public.app_settings
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

DROP POLICY IF EXISTS "Admins manage all series" ON public.series;
CREATE POLICY "Admins manage all series" ON public.series
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

DROP POLICY IF EXISTS "Admins manage all requests" ON public.subscription_requests;
CREATE POLICY "Admins manage all requests" ON public.subscription_requests
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- Reads channel_posts and channels rather than profiles, but it is FOR ALL TO
-- public for the same reason and would abort an anon read of subtitles.
DROP POLICY IF EXISTS "Channel owners can manage subtitles" ON public.subtitles;
CREATE POLICY "Channel owners can manage subtitles" ON public.subtitles
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.channel_posts cp
    JOIN public.channels c ON c.id = cp.channel_id
    WHERE cp.id = subtitles.video_id AND c.owner_id = auth.uid()
  ));

COMMIT;
