-- Migration v46: Compliance hardening (24 Aug 2026)
--
-- Context: Play Store compliance audit ahead of resubmission. This migration:
--   1. Removes traffic-source-based ("acquisition_source") content gating on
--      `channels` — the last live piece of the ad-click-attribution visibility
--      scheme started in v10/v11. This is the fix for Finding 0 of the audit:
--      content visibility must not depend on how the viewer arrived (ad click
--      vs organic), since that is the technical shape of "cloaking" under
--      Google Play's Deceptive Behavior policy.
--   2. Adds admin read/update access to `content_reports` so reports can
--      actually be reviewed through the app (previously only the reporter
--      could see their own report — no admin path existed at all).
--   3. Extends `content_reports` to reference `channel_posts` directly (the
--      table predates the channel_posts/channel_videos content model and
--      could previously only reference the older `files`/`channels` tables).
--   4. Adds a `user_blocks` table so users can block other users, per Play's
--      User Generated Content policy requirement for public social apps.
--   5. Adds `birth_year` to `profiles` and updates the new-user trigger to
--      store it, backing a real (if self-attested) age gate at signup.
--
-- Deliberately NOT touched: the `channel_posts` "paid users see ad_attributed
-- content" branch from v28. That branch already checks `plan_status` (a real
-- paying subscriber), not `acquisition_source` (ad-click attribution) — it's
-- an ordinary premium-content tier, not traffic-source cloaking, so it's left
-- as-is. Only the `channels`-level policy (still keyed on acquisition_source)
-- needed removal.
--
-- Also NOT touched: the `acquisition_source` columns themselves, or
-- `hooks/useAcquisitionSource.ts` (removed separately in the client code).
-- Dropping the columns is a follow-up once nothing references them; keeping
-- them for now avoids breaking anything unexpected.

-- ═══════════════════════════════════════════════════════════════
-- 1. Remove traffic-source-gated channel visibility
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Public channels visible to all, paid channels to paid users only" ON public.channels;
DROP POLICY IF EXISTS "Non-organic users can view public channels" ON public.channels;
DROP POLICY IF EXISTS "Anyone can view active public channels" ON public.channels;

CREATE POLICY "Public active channels visible to all"
  ON public.channels FOR SELECT
  USING (
    auth.uid() = owner_id
    OR EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id = channels.id AND user_id = auth.uid()
    )
    OR (is_public = true AND status = 'active')
  );

-- ═══════════════════════════════════════════════════════════════
-- 2. content_reports: admin visibility + extend to channel_posts/users
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS post_id uuid REFERENCES public.channel_posts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reported_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id);

DROP POLICY IF EXISTS "Admins can view all content reports" ON public.content_reports;
CREATE POLICY "Admins can view all content reports"
  ON public.content_reports FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can update content reports" ON public.content_reports;
CREATE POLICY "Admins can update content reports"
  ON public.content_reports FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ═══════════════════════════════════════════════════════════════
-- 3. user_blocks — required for Play's UGC report/block policy
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own blocks" ON public.user_blocks;
CREATE POLICY "Users manage their own blocks"
  ON public.user_blocks FOR ALL
  USING (auth.uid() = blocker_id)
  WITH CHECK (auth.uid() = blocker_id);

-- ═══════════════════════════════════════════════════════════════
-- 4. Age gate — birth_year on profiles
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_year int;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, birth_year)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data->>'birth_year', '')::int
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

NOTIFY pgrst, 'reload schema';
