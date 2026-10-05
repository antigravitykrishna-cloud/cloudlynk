-- ============================================================
-- JOLLIFY MIGRATION V2 — Channel Posts + Admin System
-- Run this in Supabase SQL editor AFTER the original schema
-- ============================================================

-- ── 1. PROFILE ADDITIONS ────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT NOT NULL DEFAULT 'organic';
  -- acquisition_source: 'organic' | 'paid'

-- ── 2. CHANNEL POSTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.channel_posts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id      UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           TEXT,
  body            TEXT,
  media_url       TEXT,          -- storage path in channel-media bucket
  media_type      TEXT CHECK (media_type IN ('image', 'video', NULL)),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by     UUID REFERENCES public.profiles(id),
  approved_at     TIMESTAMPTZ,
  rejection_note  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS channel_posts_channel_id_idx  ON public.channel_posts(channel_id);
CREATE INDEX IF NOT EXISTS channel_posts_author_id_idx   ON public.channel_posts(author_id);
CREATE INDEX IF NOT EXISTS channel_posts_status_idx      ON public.channel_posts(status);
CREATE INDEX IF NOT EXISTS channel_posts_created_at_idx  ON public.channel_posts(created_at DESC);

-- ── 3. POST COUNT TRIGGER ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_channel_post_count()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status != 'approved' THEN
    UPDATE public.channels SET post_count = post_count + 1 WHERE id = NEW.channel_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS channel_post_approved ON public.channel_posts;
CREATE TRIGGER channel_post_approved
  AFTER UPDATE ON public.channel_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_channel_post_count();

-- ── 4. RLS FOR CHANNEL_POSTS ────────────────────────────────
ALTER TABLE public.channel_posts ENABLE ROW LEVEL SECURITY;

-- Anyone in the channel (or public active channel) can read approved posts
CREATE POLICY "Members see approved posts"
  ON public.channel_posts FOR SELECT
  USING (
    status = 'approved'
    AND (
      EXISTS (
        SELECT 1 FROM public.channel_members
        WHERE channel_id = channel_posts.channel_id AND user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.channels
        WHERE id = channel_posts.channel_id AND is_public = TRUE AND status = 'active'
      )
    )
  );

-- Authors always see their own posts (any status)
CREATE POLICY "Authors see own posts"
  ON public.channel_posts FOR SELECT
  USING (auth.uid() = author_id);

-- Admins see all posts
CREATE POLICY "Admins see all posts"
  ON public.channel_posts FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Channel members can submit posts (lands in pending)
CREATE POLICY "Members can post"
  ON public.channel_posts FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id = channel_posts.channel_id AND user_id = auth.uid()
    )
  );

-- Only admins can approve / reject (status update)
CREATE POLICY "Admins review posts"
  ON public.channel_posts FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Authors can delete their own pending/rejected posts
CREATE POLICY "Authors delete own posts"
  ON public.channel_posts FOR DELETE
  USING (auth.uid() = author_id AND status IN ('pending', 'rejected'));

-- ── 5. ADMIN CHANNEL MANAGEMENT ─────────────────────────────
-- Admins can approve / suspend channels (adds to existing owner policy)
CREATE POLICY "Admins update channels"
  ON public.channels FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ── 6. CHANNEL MEDIA BUCKET ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'channel-media',
  'channel-media',
  TRUE,            -- public so images render without signed URLs
  104857600,       -- 100 MB per file
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth users upload channel media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'channel-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone views channel media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'channel-media');

CREATE POLICY "Authors delete own channel media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'channel-media'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- ── 7. MAKE YOURSELF ADMIN ──────────────────────────────────
-- Run this separately replacing the email with yours:
-- UPDATE public.profiles SET is_admin = TRUE WHERE email = 'your@email.com';
