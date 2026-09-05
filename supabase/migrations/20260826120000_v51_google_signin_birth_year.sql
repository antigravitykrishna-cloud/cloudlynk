-- v51: let a user set their own birth_year exactly once, via a
-- SECURITY DEFINER RPC.
--
-- Why this is needed: `birth_year` is one of the "privileged" profile
-- columns protected by `protect_profile_privileged_fields()` (added in v48)
-- against direct client UPDATEs — a plain
-- `supabase.from('profiles').update({birth_year})` from the app silently
-- gets reverted to the old value by that trigger.
--
-- Email/password signup never hit this: `handle_new_user()` reads
-- `birth_year` out of `raw_user_meta_data` at INSERT time (see v46), and
-- app/(auth)/signup.tsx passes it via `supabase.auth.signUp({options:{data}}}`
-- before that row is ever created, so the privileged-column trigger (which
-- only fires on UPDATE) never gets in the way.
--
-- Google Sign-In (hooks/useAuth.ts `signInWithGoogle`) has no equivalent
-- moment — Supabase creates the auth.users/profiles row from the Google
-- OAuth response, which carries no birth year, so there was previously no
-- way for a Google-signed-in user to ever supply one. That's a real gap:
-- Cloudlynk requires all users to be 18+ (enforced client-side today only
-- in the email/password signup form), so a Google-only signup path was
-- silently exempt from that check. app/(auth)/complete-profile.tsx now
-- collects birth_year post-sign-in for any account missing it and calls
-- this RPC, which re-enforces the 18+ rule server-side (not just in the UI)
-- and is intentionally one-shot: once birth_year is set, calling this again
-- raises rather than silently overwriting it, so it can't be used to
-- "re-roll" an age after the fact.

CREATE OR REPLACE FUNCTION public.set_birth_year(p_birth_year int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing int;
  v_current_year int := EXTRACT(YEAR FROM now())::int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT birth_year INTO v_existing FROM public.profiles WHERE id = auth.uid();
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Birth year is already set.' USING ERRCODE = '42501';
  END IF;

  IF p_birth_year IS NULL OR p_birth_year < v_current_year - 120 OR p_birth_year > v_current_year THEN
    RAISE EXCEPTION 'Please enter a valid birth year.' USING ERRCODE = '22023';
  END IF;

  IF (v_current_year - p_birth_year) < 18 THEN
    RAISE EXCEPTION 'You must be at least 18 years old to use Cloudlynk.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.trusted_update', 'true', true);

  UPDATE public.profiles SET birth_year = p_birth_year WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_birth_year(int) TO authenticated;
