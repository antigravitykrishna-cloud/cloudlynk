-- v58: paid subscriptions could never activate.
--
-- ═══════════════════════════════════════════════════════════════
-- THE BUG
-- ═══════════════════════════════════════════════════════════════
--
-- protect_profile_privileged_fields() (v48, amended v52) reverts privileged
-- columns — plan_status, plan_expires_at, account_status, is_admin and others
-- — for any writer it does not trust. It recognises three trusted writers:
--
--   1. coalesce(current_setting('app.trusted_update', true), '') = 'true'
--   2. coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
--   3. the caller is an admin
--
-- Branch 2 is dead. `request.jwt.claim.role` (singular) is the LEGACY
-- PostgREST GUC: deprecated in PostgREST 9 and removed in 10, replaced by
-- `request.jwt.claims` (plural, a JSON blob). On any current Supabase project
-- that setting is never populated, so current_setting returns NULL, coalesce
-- makes it '', and the comparison is false.
--
-- Consequence: an edge function holding the service-role key and writing
-- profiles through PostgREST is NOT trusted. Its UPDATE is accepted, reports
-- success, and is silently reverted by the trigger. Two functions do exactly
-- that:
--
--   supabase/functions/verify-play-receipt/index.ts:139
--     .from("profiles").update({ plan_status, plan_expires_at })
--   supabase/functions/play-rtdn-webhook/index.ts:124,157
--     .from("profiles").update({ plan_status: ... })
--
-- So: a user pays through Google Play. Google takes the money. The receipt
-- verifies. iap_purchases gets its row. profiles.plan_status stays 'free'.
-- The user gets nothing, and no error is raised anywhere.
--
-- That is the precise failure the v55 architecture exists to prevent — money
-- taken, entitlement withheld — arriving by accident through a renamed GUC.
-- Renewals, cancellations and expiries from play-rtdn-webhook were equally
-- inert.
--
-- Confirmed empirically against production, read-only apart from one test
-- profile: a single service-role UPDATE setting both full_name (unprotected)
-- and plan_status (protected) persisted full_name and reverted plan_status.
--
-- SQL-side writers were never affected. accept_terms, set_birth_year and
-- admin_set_user_approval all call set_config('app.trusted_update', ...) and
-- go through branch 1. Only the PostgREST service-role path was broken.
--
-- ═══════════════════════════════════════════════════════════════
-- 1. The durable fix — an explicit RPC, not a GUC name
-- ═══════════════════════════════════════════════════════════════
--
-- Repairing branch 2 alone would work today and rot again the next time
-- PostgREST renames a setting. The entitlement write is the single most
-- important mutation in the product; it should not depend on a string that
-- upstream considers an implementation detail.
--
-- So the edge functions get a function to call. It sets app.trusted_update
-- itself — branch 1, which is ours and cannot be renamed out from under us.
--
-- EXECUTE is granted to service_role ONLY. This function grants premium
-- access; `authenticated` must never reach it, or any signed-in user could
-- award themselves a lifetime plan over PostgREST. The REVOKEs below are
-- load-bearing, not decoration.

CREATE OR REPLACE FUNCTION public.apply_play_entitlement(
  p_user_id     uuid,
  p_plan_status text,
  p_expires_at  timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;

  -- Constrain to the states the billing path may legitimately produce. This is
  -- narrower than the column's own CHECK on purpose: nothing in the Play flow
  -- should ever be setting 'lifetime', which is granted by other means.
  IF p_plan_status NOT IN ('active', 'expired', 'cancelled', 'free') THEN
    RAISE EXCEPTION 'Unsupported plan_status: %', p_plan_status USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.trusted_update', 'true', true);

  UPDATE public.profiles
     SET plan_status     = p_plan_status,
         plan_expires_at = p_expires_at,
         plan_started_at = CASE
           WHEN p_plan_status = 'active' AND plan_status <> 'active' THEN now()
           ELSE plan_started_at
         END
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile for user %', p_user_id USING ERRCODE = 'P0002';
  END IF;
END;
$fn$;

REVOKE ALL   ON FUNCTION public.apply_play_entitlement(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_play_entitlement(uuid, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.apply_play_entitlement(uuid, text, timestamptz) IS
  'The ONLY supported way for the billing edge functions to write plan_status. Sets app.trusted_update so protect_profile_privileged_fields lets the write through. service_role only — granting this to authenticated would let any user award themselves premium. Raises if the user does not exist, so a silent no-op is impossible.';

-- ═══════════════════════════════════════════════════════════════
-- 2. Repair the dead branch anyway
-- ═══════════════════════════════════════════════════════════════
--
-- Section 1 fixes the billing path. This fixes the general case, because
-- there is no way to know which other service-role writer is currently being
-- silently reverted — the failure mode is invisible by construction, and
-- nothing in the codebase would have reported it.
--
-- Both GUC spellings are checked: the modern JSON claims blob first, the
-- legacy scalar second, so this is correct on old and new PostgREST alike.
-- The JSON parse is guarded — request.jwt.claims is absent for an
-- unauthenticated request and '' would raise on ::json.
--
-- Everything else in the trigger is carried over verbatim from v52.

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  is_trusted boolean;
  jwt_role   text;
BEGIN
  BEGIN
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role';
  EXCEPTION WHEN others THEN
    jwt_role := NULL;
  END;

  is_trusted := (
    coalesce(current_setting('app.trusted_update', true), '') = 'true'
    -- Modern PostgREST (>= 10).
    OR coalesce(jwt_role, '') = 'service_role'
    -- Legacy PostgREST (<= 9). Kept so this is correct on both.
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
    -- `plan` is a legacy column (superseded by plan_status) still read by the
    -- app for client-side paid gating, so it must not be self-editable either.
    NEW.plan := OLD.plan;
  END IF;

  -- v52: flat 15GB for every account regardless of plan_status.
  NEW.storage_limit := 16106127360;

  RETURN NEW;
END;
$fn$;

-- v55 added approval_status to the privileged set in its own amendment of this
-- trigger. If that amendment is live, re-applying the v52 body above would drop
-- the approval_status line and let users self-approve. Re-assert it here rather
-- than assuming either ordering.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'approval_status'
  ) THEN
    RAISE NOTICE 'approval_status exists — verify it is still reverted for untrusted writers (v55 amendment).';
  END IF;
END $mig$;

NOTIFY pgrst, 'reload schema';
