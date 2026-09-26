-- v89: guest accounts (Supabase anonymous sign-in).
--
-- "Continue as guest" now creates a real account with its own id, so a guest
-- can join channels and buy a plan, and keeps both when they later link
-- Google or an email (same user id, nothing is copied).
--
-- A guest is `authenticated` like anyone else, which is exactly why this
-- migration exists: every policy written for signed-in users now also
-- applies to guests. What they must NOT get is anything that costs us
-- storage or publishes content. The client-created ones are blocked here,
-- at the database, with RESTRICTIVE policies -- they AND with every
-- existing permissive policy, so no other policy can re-open the door.
--
-- Admin approval is unchanged: a guest starts 'pending' like every account
-- and cannot buy until approved.

-- 1. Who is a guest. Read from the JWT so policies cost nothing extra.
CREATE OR REPLACE FUNCTION public.is_guest()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- 2. Profile rows for guests. profiles.email is NOT NULL and a guest has no
--    email, so without this every anonymous sign-in failed in the trigger.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, birth_year, is_guest)
  VALUES (
    new.id,
    coalesce(new.email, ''),
    CASE
      WHEN new.is_anonymous THEN 'Guest ' || upper(left(replace(new.id::text, '-', ''), 6))
      ELSE coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
    END,
    nullif(new.raw_user_meta_data->>'birth_year', '')::int,
    coalesce(new.is_anonymous, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$function$;

-- 3. A guest who links Google or an email becomes a full account: same id,
--    same plan, same channels. Mirror that onto the profile.
CREATE OR REPLACE FUNCTION public.handle_user_upgraded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- profiles.email and is_guest are guarded (protect_profile_privileged_fields).
  PERFORM set_config('app.trusted_update', 'true', true);
  IF coalesce(OLD.is_anonymous, false) AND NOT coalesce(NEW.is_anonymous, false) THEN
    UPDATE public.profiles
       SET is_guest  = false,
           email     = coalesce(NEW.email, email),
           full_name = CASE
             WHEN full_name LIKE 'Guest %'
               THEN coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name',
                             split_part(NEW.email, '@', 1), full_name)
             ELSE full_name
           END
     WHERE id = NEW.id;
  ELSIF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL THEN
    UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_upgraded ON auth.users;
CREATE TRIGGER on_auth_user_upgraded
  AFTER UPDATE OF is_anonymous, email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_upgraded();

-- 4. is_guest is server-owned.
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
    NEW.is_guest := OLD.is_guest;
    NEW.email := OLD.email;
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

-- 5. No uploads and no publishing for guests.
DROP POLICY IF EXISTS guests_no_upload ON storage.objects;
CREATE POLICY guests_no_upload ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT public.is_guest()));
DROP POLICY IF EXISTS guests_no_upload_update ON storage.objects;
CREATE POLICY guests_no_upload_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT (SELECT public.is_guest()));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['files', 'channels', 'channel_posts', 'channel_videos', 'series', 'transfers', 'subtitles']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS guests_no_create ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY guests_no_create ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (NOT (SELECT public.is_guest()))', t);
  END LOOP;
END $$;

-- Same rule wherever eligibility is decided in a function (channel/post
-- creation, and generate-stream-upload via can_post_to_channel's callers).
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
      AND NOT p.is_guest
      AND (
        p.adult_confirmed_at IS NOT NULL
        OR (p.birth_year IS NOT NULL AND (EXTRACT(YEAR FROM now())::int - p.birth_year) >= 18)
      )
      AND p.terms_accepted_at IS NOT NULL
      AND p.terms_version = v.terms_version
      AND p.community_guidelines_version = v.community_guidelines_version
  );
$function$;

-- 6. Abandoned guests. Anyone can mint guest accounts, so they must not
--    pile up forever. Removed after 30 days without a sign-in, but ONLY if
--    they never paid and never had a Play purchase -- a paying guest is a
--    customer, however they signed up.
CREATE OR REPLACE FUNCTION public.prune_abandoned_guests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  WITH gone AS (
    DELETE FROM auth.users u
     WHERE u.is_anonymous
       AND coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
       AND NOT EXISTS (SELECT 1 FROM public.payment_orders o WHERE o.user_id = u.id AND o.status = 'paid')
       AND NOT EXISTS (SELECT 1 FROM public.iap_purchases i WHERE i.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id
                        AND (p.plan_status IN ('active', 'lifetime') OR p.is_admin))
    RETURNING 1
  )
  SELECT count(*) INTO n FROM gone;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.prune_abandoned_guests() FROM public, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cloudlynk-prune-guests';
SELECT cron.schedule('cloudlynk-prune-guests', '43 3 * * *', 'SELECT public.prune_abandoned_guests()');
