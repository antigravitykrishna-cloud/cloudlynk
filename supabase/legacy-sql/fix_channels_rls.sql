-- Add missing policy to channels
CREATE POLICY "Owners can view their channels"
  ON public.channels FOR SELECT
  USING (auth.uid() = owner_id);
