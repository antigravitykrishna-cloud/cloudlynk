-- ROLLBACK for v57 + v58. Paste into the Supabase SQL editor.
--
-- Run the sections in reverse order of deployment: v58 first, then v57.
-- Each section is independent — roll back only what you need to.
--
-- READ FIRST: rolling back v58 REINTRODUCES the bug where a paid subscription
-- can never activate. Only do it if v58 caused something worse, and redeploy
-- the previous edge function code at the same time (git revert), because the
-- new code calls apply_play_entitlement() and will fail once it is dropped.

-- ═══════════════════════════════════════════════════════════════
-- SECTION A — roll back v58
-- ═══════════════════════════════════════════════════════════════

-- A1. Restore the trigger to its v55 state (the live version before v58).
--     This is the v55 body verbatim, including the four approval columns.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  is_trusted boolean;
BEGIN
  is_trusted := (
    coalesce(current_setting('app.trusted_update', true), '') = 'true'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

  IF NOT is_trusted THEN
    NEW.is_admin := OLD.is_admin;
    NEW.can_upload_content := OLD.can_upload_content;
    NEW.plan_status := OLD.plan_status;
    NEW.plan_started_at := OLD.plan_started_at;
    NEW.plan_expires_at := OLD.plan_expires_at;
    NEW.account_status := OLD.account_status;
    NEW.terms_accepted_at := OLD.terms_accepted_at;
    NEW.terms_version := OLD.terms_version;
    NEW.community_guidelines_version := OLD.community_guidelines_version;
    NEW.privacy_version := OLD.privacy_version;
    NEW.birth_year := OLD.birth_year;
    NEW.plan := OLD.plan;
    NEW.approval_status := OLD.approval_status;
    NEW.approval_reviewed_by := OLD.approval_reviewed_by;
    NEW.approval_reviewed_at := OLD.approval_reviewed_at;
    NEW.approval_note := OLD.approval_note;
  END IF;

  NEW.storage_limit := 16106127360;
  RETURN NEW;
END;
$fn$;

-- A2. Remove the new RPC. Do this ONLY after the edge functions have been
--     reverted to the code that does a direct UPDATE — otherwise every
--     purchase verification errors instead of silently failing.
DROP FUNCTION IF EXISTS public.apply_play_entitlement(uuid, text, timestamptz);

-- ═══════════════════════════════════════════════════════════════
-- SECTION B — roll back v57
-- ═══════════════════════════════════════════════════════════════

-- B1. Restore the v56 SELECT policy and drop v57's.
--     Order matters: create the replacement BEFORE dropping the current one,
--     or there is a window with no SELECT policy where the feed is empty for
--     everyone. Both statements are in one transaction for that reason.
BEGIN;

CREATE POLICY channel_posts_select_v56
  ON public.channel_posts FOR SELECT
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
    OR (
      status = 'approved'
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

DROP POLICY IF EXISTS channel_posts_select_v57 ON public.channel_posts;

COMMIT;

-- B2. Re-grant subscription_requests, if something genuinely needs it back.
--     Think hard before running this — the table is the pre-Play-Billing
--     manual payment flow and re-exposing it re-creates two competing
--     subscription systems. Nothing in the app reads it.
-- GRANT SELECT, INSERT, UPDATE ON public.subscription_requests TO authenticated;

-- B3. admin_set_signed_lock is additive and harmless to leave in place.
--     Drop it only if stream-set-access has also been reverted.
-- DROP FUNCTION IF EXISTS public.admin_set_signed_lock(text);

-- ═══════════════════════════════════════════════════════════════
-- WHAT THIS FILE CANNOT RESTORE
-- ═══════════════════════════════════════════════════════════════
--
-- approve_subscription_request() and reject_subscription_request(), dropped by
-- v57. Their source is supabase/migration_v25_subscription_approval_function.sql
-- if they are ever genuinely needed. They should not be.
--
-- The four payment-screenshots storage policies, dropped by v57. Source is
-- supabase/migration_v23_create_payment_screenshots_bucket.sql.
--
-- Neither is referenced by any application code path.
