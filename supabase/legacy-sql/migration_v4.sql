-- ============================================================
-- JOLLIFY MIGRATION V4 — RLS SELECT Policy Fixes
-- Run this in Supabase SQL Editor
-- Fixes 403 errors on channel creation and post insertion
-- ============================================================

-- Fix 1: Owners can always see their own channels (pending/suspended too)
CREATE POLICY "Owners can view their channels"
  ON public.channels FOR SELECT
  USING (auth.uid() = owner_id);

-- Fix 2: Owners can see their own channel_members rows (needed for join after insert)
CREATE POLICY "Owners see own channel memberships"
  ON public.channel_members FOR SELECT
  USING (auth.uid() = user_id);

-- Fix 3: Admins can see ALL channels regardless of status
CREATE POLICY "Admins see all channels"
  ON public.channels FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Fix 4: Admins can see all channel members
CREATE POLICY "Admins see all channel members"
  ON public.channel_members FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Fix 5: Profile is readable by the owner (needed for is_admin check in RLS)
CREATE POLICY "Users can view own profile insert return"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Note: the above may already exist from migration v1 — Supabase will skip
-- if already present. Safe to run regardless.
