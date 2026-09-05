-- migration_v10_organic_rls.sql
-- Gate channel/explore access to non-organic users at the database level.
--
-- IMPORTANT: Existing ad-driven users whose profiles.acquisition_source is still
-- 'organic' (because the old code only wrote to AsyncStorage) will be locked out
-- of channel reads until they re-login, which triggers syncAcquisitionSourceToDb.
-- This is intentional — the client fix ships simultaneously.
--
-- Apply via Supabase SQL Editor after deploying the new APK.

-- ═══════════════════════════════════════════
-- 1. CHANNELS — replace the public-read policy
-- ═══════════════════════════════════════════

DROP POLICY IF EXISTS "Anyone can view active public channels" ON public.channels;

CREATE POLICY "Non-organic users can view public channels"
  ON public.channels FOR SELECT
  USING (
    -- Owner always sees their own channel
    auth.uid() = owner_id
    OR
    -- Channel member can always see their channel
    EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id = channels.id AND user_id = auth.uid()
    )
    OR
    -- Non-organic user can browse public active channels
    (
      is_public = true AND status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND acquisition_source IS DISTINCT FROM 'organic'
      )
    )
  );

-- ═══════════════════════════════════════════
-- 2. CHANNEL_POSTS — gate the public channel read path
-- ═══════════════════════════════════════════

DROP POLICY IF EXISTS "Members see approved posts" ON public.channel_posts;

CREATE POLICY "Non-organic members see approved posts"
  ON public.channel_posts FOR SELECT
  USING (
    status = 'approved'
    AND (
      -- User is a channel member
      EXISTS (
        SELECT 1 FROM public.channel_members
        WHERE channel_id = channel_posts.channel_id AND user_id = auth.uid()
      )
      OR
      -- Public active channel — but only for non-organic users
      (
        EXISTS (
          SELECT 1 FROM public.channels
          WHERE id = channel_posts.channel_id AND is_public = TRUE AND status = 'active'
        )
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
          AND acquisition_source IS DISTINCT FROM 'organic'
        )
      )
    )
  );

-- ═══════════════════════════════════════════
-- 3. CHANNEL_MEMBERS — gate joining for organic users
-- ═══════════════════════════════════════════

-- Keep existing "Members can view memberships" (user_id = auth.uid()) — that's fine,
-- an organic user shouldn't have any rows there anyway.

-- Gate INSERT so organic users can't join channels even if they craft a request:
DROP POLICY IF EXISTS "Users can join channels" ON public.channel_members;

CREATE POLICY "Non-organic users can join channels"
  ON public.channel_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND acquisition_source IS DISTINCT FROM 'organic'
    )
  );
