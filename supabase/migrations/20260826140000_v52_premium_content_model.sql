-- v52: Premium pivot — storage is now flat for everyone, and premium instead
-- gates specific CONTENT.
--
-- Old model: Premium (any active/lifetime plan_status) = 2TB of storage.
-- New model: every account, free or premium, gets the same 15GB of storage.
-- Premium instead unlocks viewing of individually-flagged "premium" content
-- (movies/series/shorts marked as such) — verified server-side, same as the
-- old storage entitlement was, via `plan_status IN ('active','lifetime')`.
--
-- This does NOT touch how a purchase is verified or how plan_status/
-- plan_expires_at get set (verify-play-receipt, play-rtdn-webhook are
-- unchanged) — only what plan_status='active' actually *grants* changes.

-- ═══════════════════════════════════════════════════════════════
-- 1. Storage: flat 15GB for everyone, no plan_status branch
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_trusted boolean;
BEGIN
  is_trusted := (
    coalesce(current_setting('app.trusted_update', true), '') = 'true'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

  IF NOT is_trusted THEN
    NEW.is_admin := OLD.is_admin;
    NEW.can_upload_content := OLD.can_upload_content;
    NEW.plan_status := OLD.plan_status;
    NEW.plan_started_at := OLD.plan_started_at;
    NEW.plan_expires_at := OLD.plan_expires_at;
    NEW.account_status := OLD.account_status;
    NEW.terms_accepted_at := OLD.terms_accepted_at;
    NEW.terms_version := OLD.terms_version;
    NEW.community_guidelines_version := OLD.community_guidelines_version;
    NEW.privacy_version := OLD.privacy_version;
    NEW.birth_year := OLD.birth_year;
    -- `plan` is a legacy column (superseded by plan_status) still read by the
    -- app for client-side paid gating, so it must not be self-editable either.
    NEW.plan := OLD.plan;
  END IF;

  -- v52: flat 15GB for every account regardless of plan_status. Premium no
  -- longer buys storage — it buys access to premium-flagged content (see
  -- section 2 below). Never silently shrinks anyone's *usable* storage
  -- below what they've already stored: increment_storage_used (unchanged)
  -- only blocks NEW uploads once storage_used would exceed storage_limit —
  -- it never deletes existing files, so a formerly-2TB account that's
  -- stored more than 15GB simply can't upload more until they free space,
  -- exactly like hitting the free-tier cap today.
  NEW.storage_limit := 16106127360; -- 15 GB, same constant as the free tier before v52

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 2. channel_posts.access_level — the new, explicit premium-content flag
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.channel_posts
  ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'free'
  CHECK (access_level IN ('free', 'premium'));

-- Backfill: before this migration, movies/series in a public channel you
-- hadn't joined were already de-facto premium-only — but only as a CLIENT-
-- SIDE courtesy filter in lib/posts.ts getExplorePosts() (it simply never
-- asked for them if the viewer wasn't on a paid plan). RLS never actually
-- enforced this: anyone querying channel_posts directly with the public
-- anon key got movies/series back regardless of plan_status. This backfill
-- preserves today's de-facto split as real data, and section 3 below is
-- what finally makes it a server-enforced rule instead of a client courtesy.
UPDATE public.channel_posts
  SET access_level = 'premium'
  WHERE content_type IN ('movie', 'series');

-- ═══════════════════════════════════════════════════════════════
-- 3. RLS: one canonical SELECT policy, replacing every SELECT policy this
--    table has accumulated across v2/v10/v11/v28/v37/v48 (some of these
--    names may already be gone in the live database depending on which
--    migrations actually ran there — DROP IF EXISTS makes this safe either
--    way; the goal is that after this migration there is exactly ONE
--    SELECT policy on channel_posts, not an ambiguous OR of several).
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Members see approved posts" ON public.channel_posts;
DROP POLICY IF EXISTS "Non-organic members see approved posts" ON public.channel_posts;
DROP POLICY IF EXISTS "Public posts visible to all, ad-attributed to paid users only" ON public.channel_posts;
DROP POLICY IF EXISTS "Channel posts visible to members + paid users" ON public.channel_posts;
DROP POLICY IF EXISTS "Public shorts visible to all users" ON public.channel_posts;
DROP POLICY IF EXISTS "Members and public can view approved posts" ON public.channel_posts;
DROP POLICY IF EXISTS "Authors see own posts" ON public.channel_posts;
DROP POLICY IF EXISTS "Admins see all posts" ON public.channel_posts;
DROP POLICY IF EXISTS "channel_posts_select_v52" ON public.channel_posts;

CREATE POLICY "channel_posts_select_v52"
  ON public.channel_posts FOR SELECT
  USING (
    -- Author always sees their own post, any status/access_level.
    author_id = auth.uid()
    -- Admins see everything (moderation queue).
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR (
      status = 'approved'
      -- Suspended/banned authors' content stays hidden even if otherwise reachable.
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles ap
        WHERE ap.id = channel_posts.author_id AND ap.account_status <> 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE b.blocker_id = auth.uid() AND b.blocked_id = channel_posts.author_id
      )
      -- Reachable at all: a member of the channel, or the channel is public+active
      -- (this branch is what lets anonymous/non-member users browse free public
      -- content — same reach as the old policies had).
      AND (
        EXISTS (
          SELECT 1 FROM public.channel_members
          WHERE channel_id = channel_posts.channel_id AND user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.channels
          WHERE id = channel_posts.channel_id AND is_public = true AND status = 'active'
        )
      )
      -- And, independently, entitled to THIS post's access level.
      AND (
        access_level = 'free'
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND plan_status IN ('active', 'lifetime')
        )
      )
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- Note: `visibility` ('public'/'ad_attributed') is no longer read by any
-- RLS policy as of this migration — access_level fully replaces its role
-- as the premium gate. Left in place (not dropped) since it costs nothing
-- to leave and dropping columns is a separate, lower-risk-to-defer cleanup.
-- ═══════════════════════════════════════════════════════════════
