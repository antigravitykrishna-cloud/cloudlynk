-- Migration v26: Fix channel_members INSERT policy to use plan_status
--
-- CONTEXT: The existing "Non-organic users can join channels" policy uses
-- `acquisition_source IS DISTINCT FROM 'organic'` to gate the INSERT. But
-- `acquisition_source` is legacy from an old ad-tracking model — every
-- normal signup has `acquisition_source = 'organic'` (the default), so
-- the policy blocks ALL organic users from joining channels.
--
-- Both admin (krishnapate43) and john have acquisition_source = 'organic'
-- in the DB, so neither can join a channel even though both are paid
-- (plan_status = 'active'). Channel join fails silently (RLS returns
-- 0 rows affected, no error), and the UI shows a success that didn't happen.
--
-- The paywall model has moved to plan_status (v0.5.0). Replace the legacy
-- acquisition_source check with a plan_status check:
--   - 'active' / 'lifetime': full paid subscribers, can join
--   - 'pending': submitted payment proof, awaiting admin approval, can join
--   - 'free' / 'expired' / 'cancelled': cannot join (free users see lock UI)
--
-- No source code changes. No rebuild. Apply this migration and the
-- existing APK's channel join will start working.

DROP POLICY IF EXISTS "Non-organic users can join channels" ON public.channel_members;

CREATE POLICY "Paid and pending users can join channels"
  ON public.channel_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND plan_status IN ('active', 'pending', 'lifetime')
    )
  );
