-- Migration v48: UGC moderation backend + entitlement security (25 Aug 2026)
--
-- This is the backend half of the "build a compliant backend, let the
-- front-end be rebuilt" plan. It does five things:
--
--   1. FIXES A CLOAKING BUG v46 MISSED. v46 replaced the acquisition_source
--      gate on `channels` SELECT, but two more policies from
--      migration_v10_organic_rls.sql were still live and untouched:
--      "Non-organic members see approved posts" (channel_posts SELECT) and
--      "Non-organic users can join channels" (channel_members INSERT). Both
--      literally blocked *organic* (non-ad-click) users — including a Google
--      reviewer opening the app directly — while letting ad-attributed users
--      through. This is the textbook shape of Play's "cloaking" violation and
--      was very likely still live and still contributing to the account
--      termination even after v46 shipped. Both are replaced here with
--      acquisition-source-free versions.
--   2. Adds a real terms/guidelines acceptance system (versioned, stored,
--      enforced server-side before any UGC can be created) — Play's UGC
--      policy requires explicit acceptance before upload, and it needs to be
--      a durable record, not just page copy.
--   3. Upgrades `content_reports` into a real moderation backend: target
--      type, resolution/moderator-note trail, and an `admin_resolve_report`
--      RPC that can actually remove content / suspend a channel / suspend or
--      ban a user — not just mark a row "reviewed".
--   4. Locks down `profiles` so a normal authenticated user cannot grant
--      themselves admin, premium, or extra storage by calling `update` on
--      their own row — only service-role calls, admin-invoked RPCs, and the
--      new `accept_terms` RPC (for its own narrow column set) can touch the
--      privileged columns. Also makes `storage_limit` a computed function of
--      `plan_status` so "2 TB for premium" is actually enforced instead of
--      just claimed in the UI, and makes `increment_storage_used` reject a
--      write that would exceed the quota instead of only tracking it.
--   5. Adds `account_status` (active/suspended/banned) and requires it (plus
--      the age gate and terms acceptance) before a user can create a channel
--      or post content.
--
-- None of this depends on any specific front-end — it's the contract a new
-- UI can be built against. See BACKEND_REFERENCE.md for the RPC/table list
-- kept in sync with this migration.

-- ═══════════════════════════════════════════════════════════════
-- 1. Close the remaining cloaking gate (channel_posts, channel_members)
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Non-organic members see approved posts" ON public.channel_posts;
DROP POLICY IF EXISTS "Members see approved posts" ON public.channel_posts;

DROP POLICY IF EXISTS "Non-organic users can join channels" ON public.channel_members;
DROP POLICY IF EXISTS "Users can join channels" ON public.channel_members;

CREATE POLICY "Authenticated users can join channels"
  ON public.channel_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- 2. account_status + terms/guidelines acceptance columns
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS community_guidelines_version text,
  ADD COLUMN IF NOT EXISTS privacy_version text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active', 'suspended', 'banned'));

-- Single source of truth for "current" policy versions. Bump the return
-- values here when Terms/Guidelines change; every previously-accepting user
-- will then fail `can_create_ugc` until they re-accept.
CREATE OR REPLACE FUNCTION public.current_policy_versions()
RETURNS TABLE (terms_version text, community_guidelines_version text, privacy_version text)
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'v1'::text, 'v1'::text, 'v1'::text;
$$;

CREATE OR REPLACE FUNCTION public.accept_terms(
  p_terms_version text,
  p_community_guidelines_version text,
  p_privacy_version text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.trusted_update', 'true', true);

  UPDATE public.profiles
  SET terms_accepted_at = now(),
      terms_version = p_terms_version,
      community_guidelines_version = p_community_guidelines_version,
      privacy_version = p_privacy_version
  WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_terms(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_create_ugc(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p, public.current_policy_versions() v
    WHERE p.id = p_user_id
      AND p.account_status = 'active'
      AND p.birth_year IS NOT NULL
      AND (EXTRACT(YEAR FROM now())::int - p.birth_year) >= 18
      AND p.terms_accepted_at IS NOT NULL
      AND p.terms_version = v.terms_version
      AND p.community_guidelines_version = v.community_guidelines_version
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_create_ugc(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3. Gate channel/content creation on can_create_ugc()
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated users can create channels" ON public.channels;
CREATE POLICY "Eligible users can create channels"
  ON public.channels FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND public.can_create_ugc(auth.uid()));

DROP POLICY IF EXISTS "Members can post" ON public.channel_posts;
CREATE POLICY "Eligible members can post"
  ON public.channel_posts FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND public.can_create_ugc(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id = channel_posts.channel_id AND user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 4. Hide content from/for suspended, banned, and blocked accounts
-- ═══════════════════════════════════════════════════════════════

CREATE POLICY "Members and public can view approved posts"
  ON public.channel_posts FOR SELECT
  USING (
    status = 'approved'
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles ap
      WHERE ap.id = channel_posts.author_id AND ap.account_status <> 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE b.blocker_id = auth.uid() AND b.blocked_id = channel_posts.author_id
    )
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

-- ═══════════════════════════════════════════════════════════════
-- 5. content_reports → real moderation backend
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS moderator_note text;

ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check
  CHECK (target_type IS NULL OR target_type IN ('content', 'user', 'copyright', 'other'));

-- Backfill target_type for existing rows so nothing is left NULL.
UPDATE public.content_reports SET target_type = CASE
  WHEN reported_user_id IS NOT NULL AND post_id IS NULL THEN 'user'
  ELSE 'content'
END WHERE target_type IS NULL;

ALTER TABLE public.channel_posts DROP CONSTRAINT IF EXISTS channel_posts_status_check;
ALTER TABLE public.channel_posts ADD CONSTRAINT channel_posts_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'removed'));

CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id uuid,
  p_action text,             -- 'dismiss' | 'remove_content' | 'suspend_channel' | 'suspend_user' | 'ban_user' | 'warn'
  p_resolution text,
  p_moderator_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.content_reports%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.content_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report % not found', p_report_id;
  END IF;

  PERFORM set_config('app.trusted_update', 'true', true);

  IF p_action = 'remove_content' AND r.post_id IS NOT NULL THEN
    UPDATE public.channel_posts SET status = 'removed' WHERE id = r.post_id;
  ELSIF p_action = 'suspend_channel' AND r.channel_id IS NOT NULL THEN
    UPDATE public.channels SET status = 'suspended' WHERE id = r.channel_id;
  ELSIF p_action = 'suspend_user' AND r.reported_user_id IS NOT NULL THEN
    UPDATE public.profiles SET account_status = 'suspended' WHERE id = r.reported_user_id;
  ELSIF p_action = 'ban_user' AND r.reported_user_id IS NOT NULL THEN
    UPDATE public.profiles SET account_status = 'banned' WHERE id = r.reported_user_id;
  ELSIF p_action NOT IN ('dismiss', 'warn') THEN
    RAISE EXCEPTION 'Action % has no target on this report', p_action;
  END IF;

  UPDATE public.content_reports
  SET status = CASE WHEN p_action = 'dismiss' THEN 'dismissed' ELSE 'resolved' END,
      resolution = p_resolution,
      moderator_note = p_moderator_note,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_report_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text, text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 6. Lock down profiles: privileged columns are not self-editable
-- ═══════════════════════════════════════════════════════════════
--
-- schema.sql's "Users can update own profile" policy has no WITH CHECK, so
-- any authenticated user can currently set their OWN is_admin, plan_status,
-- storage_limit, can_upload_content, etc. via a plain PATCH. Postgres RLS
-- can't restrict individual columns, so this is enforced with a trigger
-- instead: privileged columns are silently reverted to their previous value
-- unless the change comes from a service-role call, an admin-invoked RPC, or
-- a narrowly-scoped trusted RPC (accept_terms, admin_resolve_report) that
-- sets `app.trusted_update` for the duration of its own UPDATE.
--
-- storage_limit is also recomputed here unconditionally from plan_status, so
-- "2 TB for premium" is an actual invariant rather than a value someone has
-- to remember to set correctly in every code path that touches plan_status.

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

  -- Always recomputed, regardless of who's writing — single source of truth.
  NEW.storage_limit := CASE
    WHEN NEW.plan_status IN ('active', 'lifetime') THEN 2199023255552 -- 2 TB
    ELSE 16106127360                                                  -- 15 GB free tier
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged_fields ON public.profiles;
CREATE TRIGGER profiles_guard_privileged_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

-- Reconcile the profile UPDATE policy. An earlier out-of-band hotfix replaced
-- schema.sql's permissive "Users can update own profile" with a policy named
-- "Users update safe profile fields only", whose WITH CHECK pins a list of
-- privileged columns — including the now-removed `acquisition_source`, which
-- is what blocks its DROP in section 8. Column-level protection is the guard
-- trigger's job as of this migration, so restore the canonical permissive
-- policy (idempotent: safe whether or not the hotfix policy is present).
DROP POLICY IF EXISTS "Users update safe profile fields only" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ═══════════════════════════════════════════════════════════════
-- 7. Atomic, quota-enforcing storage counter
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_storage_used(p_user_id uuid, p_bytes bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  updated_rows int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Cannot modify storage counter for another user' USING ERRCODE = '42501';
  END IF;
  IF p_bytes IS NULL OR p_bytes < 0 THEN
    RAISE EXCEPTION 'Bytes must be a non-negative integer' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET storage_used = storage_used + p_bytes
  WHERE id = p_user_id
    AND storage_used + p_bytes <= storage_limit;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows = 0 THEN
    RAISE EXCEPTION 'Storage quota exceeded' USING ERRCODE = '23514';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_storage_used(uuid, bigint) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 8. Drop acquisition_source for real (v46 said "follow-up once nothing
--    references them" — nothing does, as of section 1 above)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.profiles DROP COLUMN IF EXISTS acquisition_source;
ALTER TABLE public.channels DROP COLUMN IF EXISTS acquisition_source;

NOTIFY pgrst, 'reload schema';
