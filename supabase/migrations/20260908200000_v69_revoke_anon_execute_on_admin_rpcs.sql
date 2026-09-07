-- ═══════════════════════════════════════════════════════════════════════════
-- v69 — Remove anon's EXECUTE grant on the admin RPCs
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Supabase's security advisor flags 25 SECURITY DEFINER functions as callable
-- by anon, 14 of them admin_* plus demo_reset.
--
-- They are NOT currently exploitable, and that was verified by calling them
-- with the public key rather than by reading the source:
--
--   admin_search_users        -> 42501 "Admin access required"
--   admin_set_user_approval   -> 42501 "Admin access required"
--   admin_list_audit_log      -> 42501 "Admin access required"
--
-- Each body opens with `IF NOT EXISTS (SELECT 1 FROM profiles WHERE
-- id = auth.uid() AND is_admin)` (or is_active_admin()), and auth.uid() is
-- NULL for anon, so the guard always fires.
--
-- The grant is still worth removing. Right now a single mistake in a single
-- guard — one function added without the check, one refactor that drops it —
-- is directly reachable by anyone holding the publishable key, which is
-- compiled into the APK and served on the website. Revoking EXECUTE means
-- such a mistake fails at the privilege layer instead.
--
-- The grant exists because Postgres grants EXECUTE to PUBLIC on new functions
-- by default, and PUBLIC includes anon. These predate the migrations that
-- started revoking it explicitly.
--
-- DELIBERATELY NOT REVOKED — anon policies call these and browsing breaks
-- without them:
--   is_profile_active(uuid)          -- channel_posts_select_anon (v66)
--   has_public_approved_post(uuid)   -- profiles_select_anon      (v65)

BEGIN;

REVOKE EXECUTE ON FUNCTION public.admin_clear_signed_lock(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_signed_lock(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_post_grantees(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_profiles_by_ids(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_grants(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_content_access(uuid, uuid, timestamptz, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_content_access(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_audit_log(integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_user_approvals(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_search_users(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_post_access_level(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_post_status(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_approval(uuid, text, text) FROM anon;

-- Wipes and re-seeds demo data. Guarded, but there is no reading of this name
-- on which a signed-out visitor should be able to reach it at all.
REVOKE EXECUTE ON FUNCTION public.demo_reset() FROM anon;

-- Both require a session (`IF auth.uid() IS NULL THEN RAISE`), so anon can
-- only ever get an exception out of them.
REVOKE EXECUTE ON FUNCTION public.accept_terms(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_birth_year(integer) FROM anon;

COMMIT;
