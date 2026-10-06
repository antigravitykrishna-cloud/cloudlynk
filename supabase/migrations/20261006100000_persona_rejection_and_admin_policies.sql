-- Rejection gets its own state instead of reusing the approval fields.
ALTER TABLE public.user_personas
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid;

-- The old policy trusted auth.users.raw_user_meta_data.role, which users can edit themselves,
-- and it did not match the app's admin definition (profiles.is_admin). It also gave admins no
-- way to read other users' rows, so the approvals screen could never list anyone.
DROP POLICY IF EXISTS "Admins manage user_personas" ON public.user_personas;
DROP POLICY IF EXISTS "Admins read user_personas" ON public.user_personas;
DROP POLICY IF EXISTS "Admins update user_personas" ON public.user_personas;

CREATE POLICY "Admins read user_personas"
  ON public.user_personas
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins update user_personas"
  ON public.user_personas
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
