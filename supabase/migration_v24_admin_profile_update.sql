-- Migration v24: Allow admins to update any user's profile
--
-- CONTEXT: The admin subscription approval flow (app/admin/subscription-requests.tsx)
-- calls supabase.from('profiles').update({plan, plan_status, plan_expires_at, plan_started_at})
-- .eq('id', req.user_id) where req.user_id is the target user, not the admin.
--
-- The existing "Users update safe profile fields only" policy is the only UPDATE policy
-- on profiles. Its USING clause is (auth.uid() = id), which only lets a user update
-- their own row. So the admin's update returns 0 rows affected (RLS silently filters),
-- no error is thrown, and the UI shows a success alert — but the profile never updates.
--
-- This migration adds a permissive admin policy. With multiple permissive policies on
-- the same operation, ANY one passing is enough — so admins can now update any profile,
-- and regular users can still only update their own (per the existing policy).
--
-- No source code changes needed. Just apply this migration and re-test the admin
-- approval flow (no rebuild required since this is pure SQL).

create policy "Admins can update any profile"
  on public.profiles
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
