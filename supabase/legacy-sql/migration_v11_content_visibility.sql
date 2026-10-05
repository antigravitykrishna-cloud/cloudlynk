-- migration_v11_content_visibility.sql
-- Adds visibility column to channel_posts and acquisition_source to channels.
-- Softens RLS: public posts visible to all, ad_attributed only to paid users.
-- Apply via Supabase SQL Editor after deploying the new APK.

-- Add visibility column to channel_posts
ALTER TABLE channel_posts
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'ad_attributed'));

-- Add acquisition_source to channels
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS acquisition_source text NOT NULL DEFAULT 'organic'
  CHECK (acquisition_source IN ('organic', 'paid'));

-- Soften RLS on channel_posts: allow public reads for everyone,
-- ad_attributed only for non-organic users
DROP POLICY IF EXISTS "Non-organic members see approved posts" ON public.channel_posts;
CREATE POLICY "Public posts visible to all, ad-attributed to paid users only"
  ON public.channel_posts FOR SELECT
  USING (
    status = 'approved' AND (
      visibility = 'public'
      OR (
        visibility = 'ad_attributed'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND acquisition_source = 'paid'
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.channel_members
        WHERE channel_id = channel_posts.channel_id AND user_id = auth.uid()
      )
      OR author_id = auth.uid()
    )
  );

-- Soften RLS on channels
DROP POLICY IF EXISTS "Non-organic users can view public channels" ON public.channels;
CREATE POLICY "Public channels visible to all, paid channels to paid users only"
  ON public.channels FOR SELECT
  USING (
    auth.uid() = owner_id
    OR EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id = channels.id AND user_id = auth.uid()
    )
    OR (
      is_public = true AND status = 'active'
      AND (
        channels.acquisition_source = 'organic'
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND acquisition_source = 'paid'
        )
      )
    )
  );
