-- v76: make account deletion actually complete.
--
-- Applied to production via the Supabase MCP; recorded here so the repo and
-- the database stay in step.
--
-- delete-account cleans up the tables a user OWNS, then calls
-- auth.admin.deleteUser(). That last call was failing for a whole class of
-- accounts, because eight foreign keys point at the user in an ATTRIBUTION
-- role -- who approved this, who reviewed that, who granted access -- and all
-- eight were ON DELETE NO ACTION. Nothing in the cleanup list touches them,
-- because they are not the user's own data; they are other people's rows that
-- happen to name this user.
--
-- The result: any account that had ever approved a post, reviewed a report,
-- approved a user, granted content access or written an audit entry got
-- "Account deletion failed. Please try again." forever. Retrying could never
-- help. At the time of writing 38 channel_posts rows carried approved_by and
-- one profile carried approval_reviewed_by, so this was live, not theoretical:
-- neither admin account could delete itself, and Play's account-deletion
-- requirement was not satisfied for that class of user.
--
-- Verified before and after by attempting the real DELETE inside a DO block
-- that then raises, so the transaction rolls back. Before: FK violation.
-- After: "ROLLBACK_TEST_OK ... succeeded".
--
-- SET NULL rather than CASCADE on every one of them. These are audit and
-- attribution records belonging to OTHER rows: cascading would delete 38
-- approved posts because the admin who approved them left, which is data loss
-- dressed up as a privacy feature. Nulling severs the personal link -- which
-- is what deletion is actually for -- and leaves the post, the report and the
-- log entry intact.
--
-- Two columns are NOT NULL and have to be relaxed first. Both are safe to
-- null: they are "who did this" fields, and a null reads as "a since-deleted
-- account", which is exactly what happened.

ALTER TABLE public.admin_audit_log       ALTER COLUMN admin_id   DROP NOT NULL;
ALTER TABLE public.content_access_grants ALTER COLUMN granted_by DROP NOT NULL;

COMMENT ON COLUMN public.admin_audit_log.admin_id IS
  'Admin who performed the action. Nullable since v76: NULL means the admin account has since been deleted. The log entry itself is retained deliberately -- it is a moderation record, not the deleted user''s personal data.';

COMMENT ON COLUMN public.content_access_grants.granted_by IS
  'Admin who issued the grant. Nullable since v76 for the same reason as admin_audit_log.admin_id -- the grant stays valid for its holder when the granting admin leaves.';

ALTER TABLE public.admin_audit_log DROP CONSTRAINT admin_audit_log_admin_id_fkey;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.channel_posts DROP CONSTRAINT channel_posts_approved_by_fkey;
ALTER TABLE public.channel_posts ADD CONSTRAINT channel_posts_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.content_access_grants DROP CONSTRAINT content_access_grants_granted_by_fkey;
ALTER TABLE public.content_access_grants ADD CONSTRAINT content_access_grants_granted_by_fkey
  FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.content_reports DROP CONSTRAINT content_reports_reviewed_by_fkey;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.profiles DROP CONSTRAINT profiles_approval_reviewed_by_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_approval_reviewed_by_fkey
  FOREIGN KEY (approval_reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.series DROP CONSTRAINT series_approved_by_fkey;
ALTER TABLE public.series ADD CONSTRAINT series_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.subscription_requests DROP CONSTRAINT subscription_requests_reviewed_by_fkey;
ALTER TABLE public.subscription_requests ADD CONSTRAINT subscription_requests_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- channel_videos.uploaded_by stays NO ACTION on purpose. It is the user's OWN
-- uploaded content, not attribution on someone else's row, and delete-account
-- already removes those rows explicitly. Turning it into SET NULL would leave
-- orphaned videos behind if that delete ever silently failed -- the FK failing
-- loudly is the better outcome.

NOTIFY pgrst, 'reload schema';
