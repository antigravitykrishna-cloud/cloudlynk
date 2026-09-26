-- v88b: "Admins can update any profile" queried public.profiles from inside a
-- policy ON public.profiles. Postgres rejects that as infinite recursion the
-- moment the policy is evaluated, so EVERY profile update by a non-admin
-- (settings toggles, edit profile, push token) failed with 42P17.
-- is_active_admin() is SECURITY DEFINER, so it reads profiles without RLS.
ALTER POLICY "Admins can update any profile" ON public.profiles
  USING ((SELECT public.is_active_admin()))
  WITH CHECK ((SELECT public.is_active_admin()));
