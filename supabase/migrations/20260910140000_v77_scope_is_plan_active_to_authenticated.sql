-- v77: take anon back off is_plan_active().
--
-- Applied to production via the Supabase MCP; recorded here so the repo and
-- the database stay in step.
--
-- v75 granted EXECUTE to `anon, authenticated`, copying the grant line from
-- is_profile_active (v66). That copy was wrong. is_profile_active genuinely
-- needs anon, because channel_posts_select_anon calls it. Nothing in the anon
-- path calls is_plan_active: guests are served by channel_posts_select_anon,
-- which shows the premium catalogue locked and never asks whether anyone has a
-- plan.
--
-- Left as it was, an unauthenticated caller could POST
-- /rest/v1/rpc/is_plan_active with any profile id and learn whether that person
-- is a paying subscriber. It needs a known uuid so it is not an enumeration
-- hole, but it is a subscriber-status oracle available without signing in, and
-- nothing needs it.
--
-- Flagged by the Supabase security advisor
-- (anon_security_definer_function_executable) after v75 was applied.

REVOKE EXECUTE ON FUNCTION public.is_plan_active(uuid) FROM anon;

COMMENT ON FUNCTION public.is_plan_active(uuid) IS
  'True when the user holds a subscription that is live right now: lifetime, or active with plan_expires_at absent or in the future. Single source of truth for the premium gate (v75) - RLS and stream-playback-token must never disagree about this. EXECUTE is authenticated-only (v77): the anon read path never asks about plans.';

NOTIFY pgrst, 'reload schema';
