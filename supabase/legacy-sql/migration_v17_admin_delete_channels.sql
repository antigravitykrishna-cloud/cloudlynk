-- Migration v17: Allow admins to delete any channel
-- Admin users (profiles.is_admin = true) can delete any channel regardless of ownership.

CREATE POLICY "Admins can delete any channel"
  ON channels FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );
