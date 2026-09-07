-- ═══════════════════════════════════════════════════════════════════════════
-- v70 — Actually remove the grant v69 tried to remove
-- ═══════════════════════════════════════════════════════════════════════════
--
-- v69 ran `REVOKE EXECUTE ... FROM anon` and changed nothing. Verified after
-- the fact, which is the only reason it was caught:
--
--   admin_search_users  proacl = {=X/postgres, postgres=X/postgres,
--                                 authenticated=X/postgres, service_role=X/postgres}
--
-- The leading `=X/postgres` is a grant to PUBLIC — an empty grantee means
-- PUBLIC. anon was never granted EXECUTE directly; it inherits from PUBLIC.
-- Revoking a privilege a role does not directly hold is a silent no-op, so
-- the migration applied cleanly and accomplished nothing. `anon_exec` stayed
-- true.
--
-- Revoking from PUBLIC is what actually removes it. authenticated and
-- service_role hold their own explicit grants (visible in the ACL above), so
-- they are unaffected — the admin screens keep working.
--
-- Lesson worth keeping: after a REVOKE, check has_function_privilege() rather
-- than trusting that the statement succeeded.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.admin_clear_signed_lock(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_signed_lock(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_post_grantees(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_profiles_by_ids(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_grants(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_grant_content_access(uuid, uuid, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_content_access(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_audit_log(integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_user_approvals(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_search_users(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_post_access_level(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_post_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_approval(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.demo_reset() FROM PUBLIC;

-- Re-assert the grants the app needs, in case any of the above were relying
-- on the PUBLIC grant rather than holding their own.
GRANT EXECUTE ON FUNCTION public.admin_clear_signed_lock(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_signed_lock(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_post_grantees(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_profiles_by_ids(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_grants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_content_access(uuid, uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_content_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_log(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_user_approvals(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_post_access_level(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_post_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_approval(uuid, text, text) TO authenticated;

-- demo_reset stays service_role-only; nothing in the app calls it.
GRANT EXECUTE ON FUNCTION public.demo_reset() TO service_role;

COMMIT;
