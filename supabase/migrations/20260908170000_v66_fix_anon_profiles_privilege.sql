-- ═══════════════════════════════════════════════════════════════════════════
-- v66 — HOTFIX 2: anon cannot read profiles.account_status from a policy
-- ═══════════════════════════════════════════════════════════════════════════
--
-- After v65 removed the recursion, anon reads of channel_posts failed with
--
--   42501: permission denied for table profiles
--
-- channel_posts_select_anon (v61) contains:
--
--   NOT EXISTS (SELECT 1 FROM public.profiles ap
--               WHERE ap.id = channel_posts.author_id
--                 AND ap.account_status <> 'active')
--
-- A policy's USING expression is evaluated with the *querying* role's
-- privileges when it reads another table. v61 granted anon a deliberately
-- narrow column list on profiles — (id, full_name, avatar_url, username) —
-- so that a guest can render an author byline but never sees email. That list
-- does not include account_status, so the subquery is refused.
--
-- Widening the grant is the wrong fix: account_status is moderation state,
-- and adding it to the anon grant would publish who is suspended to anyone
-- with the public key. Instead the check moves into a SECURITY DEFINER
-- function, which runs as its owner and therefore needs no anon privilege at
-- all — the same technique v65 used for the recursion, applied to the
-- privilege problem.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_profile_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Defaults to false for a missing profile: an orphaned post should be
  -- hidden, not shown.
  SELECT coalesce(
    (SELECT p.account_status = 'active' FROM public.profiles p WHERE p.id = p_user_id),
    false
  );
$$;

REVOKE ALL   ON FUNCTION public.is_profile_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_profile_active(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.is_profile_active(uuid) IS
  'True when the account is active. SECURITY DEFINER so anon policies can test moderation state without account_status being readable through the public key (see v66).';

DROP POLICY IF EXISTS channel_posts_select_anon ON public.channel_posts;

CREATE POLICY channel_posts_select_anon
  ON public.channel_posts FOR SELECT
  TO anon
  USING (
    status = 'approved'
    -- A suspended or banned creator's work stays hidden from guests too.
    AND public.is_profile_active(channel_posts.author_id)
    -- Public, active channels only. Private channels require membership, and
    -- a guest cannot be a member of anything.
    AND EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_posts.channel_id
        AND c.is_public = true
        AND c.status = 'active'
    )
  );

COMMIT;
