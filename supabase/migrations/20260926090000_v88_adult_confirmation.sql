-- v88: the 18+ check is the age gate every visitor answers on first open
-- (components/AgeGate.tsx), not a birth year typed in again after sign-in.
--
-- The gate is self-attested, and so was the birth year -- asking twice added
-- no assurance, only a second screen. `adult_confirmed_at` records that the
-- account holder confirmed they are 18 or older; `confirm_adult()` is the
-- only way to set it. Existing accounts with an adult birth year on file
-- still qualify, so nobody is sent back through a screen.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS adult_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION public.confirm_adult()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.trusted_update', 'true', true);
  UPDATE public.profiles
     SET adult_confirmed_at = coalesce(adult_confirmed_at, now())
   WHERE id = auth.uid();
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_adult() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_adult() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_create_ugc(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p, public.current_policy_versions() v
    WHERE p.id = p_user_id
      AND p.account_status = 'active'
      AND (
        p.adult_confirmed_at IS NOT NULL
        OR (p.birth_year IS NOT NULL AND (EXTRACT(YEAR FROM now())::int - p.birth_year) >= 18)
      )
      AND p.terms_accepted_at IS NOT NULL
      AND p.terms_version = v.terms_version
      AND p.community_guidelines_version = v.community_guidelines_version
  );
$function$;

-- Only confirm_adult() (or an admin) may set it.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    OR coalesce(jwt_role, '') = 'service_role'
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
    NEW.adult_confirmed_at := OLD.adult_confirmed_at;
    NEW.plan := OLD.plan;
    NEW.approval_status := OLD.approval_status;
    NEW.approval_reviewed_by := OLD.approval_reviewed_by;
    NEW.approval_reviewed_at := OLD.approval_reviewed_at;
    NEW.approval_note := OLD.approval_note;
    NEW.storage_used := OLD.storage_used;
    NEW.creator_status := OLD.creator_status;
    NEW.role := OLD.role;
  END IF;
  NEW.storage_limit := 16106127360;
  RETURN NEW;
END;
$function$;
