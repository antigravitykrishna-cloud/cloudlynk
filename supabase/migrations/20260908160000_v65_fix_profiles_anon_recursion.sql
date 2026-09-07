-- ═══════════════════════════════════════════════════════════════════════════
-- v65 — HOTFIX: infinite recursion between the two anon SELECT policies
-- ═══════════════════════════════════════════════════════════════════════════
--
-- v61 shipped two policies that reference each other:
--
--   channel_posts_select_anon  -> reads public.profiles  (is the author active?)
--   profiles_select_anon       -> reads public.channel_posts
--                                 (has this person published anything public?)
--
-- Evaluating either one triggers the other, and Postgres stops with
--
--   42P17: infinite recursion detected in policy for relation "channel_posts"
--
-- Every anon read of channel_posts returned HTTP 500, which is the whole
-- Explore screen for a signed-out visitor. Caught by probing the live table
-- straight after the v57-v64 push; it does not show up in a migration apply,
-- because creating the policies is legal — only reading through them fails.
--
-- The fix keeps the anti-enumeration rule that made the profiles policy worth
-- having. Without that EXISTS the whole user table is listable by display
-- name; with it inline, it recurses. Moving the check into a SECURITY DEFINER
-- function is what breaks the cycle: the function body runs as its owner, so
-- the inner read of channel_posts does not re-enter RLS at all.

BEGIN;

-- STABLE, so the planner evaluates it once per row rather than per reference.
-- SECURITY DEFINER is the point: it bypasses RLS on channel_posts/channels and
-- therefore cannot call back into the policy that calls this function.
CREATE OR REPLACE FUNCTION public.has_public_approved_post(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channel_posts p
    JOIN public.channels c ON c.id = p.channel_id
    WHERE p.author_id = p_author_id
      AND p.status = 'approved'
      AND c.is_public = true
      AND c.status = 'active'
  );
$$;

REVOKE ALL   ON FUNCTION public.has_public_approved_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_approved_post(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.has_public_approved_post(uuid) IS
  'True when the given author has at least one approved post in a public, active channel. SECURITY DEFINER so that profiles_select_anon can ask the question without re-entering RLS on channel_posts — inlining this query caused 42P17 infinite recursion (see v65).';

DROP POLICY IF EXISTS profiles_select_anon ON public.profiles;

CREATE POLICY profiles_select_anon
  ON public.profiles FOR SELECT
  TO anon
  USING (
    account_status = 'active'
    AND public.has_public_approved_post(profiles.id)
  );

COMMIT;
