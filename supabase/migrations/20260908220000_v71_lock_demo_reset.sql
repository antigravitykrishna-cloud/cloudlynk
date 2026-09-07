-- ═══════════════════════════════════════════════════════════════════════════
-- v71 — demo_reset() becomes service_role-only
-- ═══════════════════════════════════════════════════════════════════════════
--
-- v70 removed anon's access but left `authenticated=X`, so any signed-in user
-- could still call it. It resets profiles, deletes subscriptions, flips posts
-- back to pending and deletes memberships. It has an internal is_admin guard,
-- but this is a destructive maintenance routine that nothing in app/, lib/ or
-- hooks/ calls — verified before writing this — so no client role needs it at
-- all. The remaining grant was surface with no purpose.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.demo_reset() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.demo_reset() TO service_role;

COMMENT ON FUNCTION public.demo_reset() IS
  'Destructive demo-data reset. service_role only since v71 — it was executable by every signed-in user, guarded only by an in-body is_admin check. Nothing in the app calls it.';

COMMIT;
