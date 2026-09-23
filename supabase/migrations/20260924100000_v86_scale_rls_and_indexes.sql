-- v86: scale. Performance advisor findings, 2026-09-24.
--
-- 1. auth_rls_initplan (65 policies): policies called auth.uid() bare, which
--    Postgres evaluates once PER ROW. Wrapped as (SELECT auth.uid()) it is
--    evaluated once per query. Same logic, rewritten mechanically -- every
--    public-schema policy whose text contains a bare auth.uid().
--
-- 2. Indexes for every foreign key the advisor flagged (joins and ON DELETE
--    cascades/SET NULL scan these), plus composite indexes for the queries the
--    app runs most: a channel's approved posts newest-first (channel screen,
--    Feed), all approved posts newest-first (Explore), and a user's
--    notifications newest-first / unread count.

DO $$
DECLARE
  r record;
  q text;
  c text;
  sql text;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, cl.relname AS tbl, pol.polname AS name,
           pg_get_expr(pol.polqual, pol.polrelid) AS qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS chk
      FROM pg_policy pol
      JOIN pg_class cl ON cl.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE n.nspname = 'public'
  LOOP
    q := r.qual;
    c := r.chk;
    IF (q IS NOT NULL AND q LIKE '%auth.uid()%' AND q NOT LIKE '%SELECT auth.uid()%')
       OR (c IS NOT NULL AND c LIKE '%auth.uid()%' AND c NOT LIKE '%SELECT auth.uid()%') THEN
      sql := format('ALTER POLICY %I ON %I.%I', r.name, r.schema, r.tbl);
      IF q IS NOT NULL AND q NOT LIKE '%SELECT auth.uid()%' THEN
        sql := sql || ' USING (' || replace(q, 'auth.uid()', '(SELECT auth.uid())') || ')';
      END IF;
      IF c IS NOT NULL AND c NOT LIKE '%SELECT auth.uid()%' THEN
        sql := sql || ' WITH CHECK (' || replace(c, 'auth.uid()', '(SELECT auth.uid())') || ')';
      END IF;
      EXECUTE sql;
    END IF;
  END LOOP;
END $$;

-- Foreign-key covering indexes, created from the constraint definitions so a
-- column name can never be mistyped.
DO $$
DECLARE
  r record;
  cols text;
BEGIN
  FOR r IN
    SELECT con.conname, con.conrelid::regclass AS tbl, con.conrelid, con.conkey
      FROM pg_constraint con
     WHERE con.contype = 'f'
       AND con.conname IN (
         'admin_audit_log_admin_id_fkey', 'channel_posts_approved_by_fkey', 'channels_owner_id_fkey',
         'content_access_grants_granted_by_fkey', 'content_reports_channel_id_fkey',
         'content_reports_file_id_fkey', 'content_reports_post_id_fkey',
         'content_reports_reported_user_id_fkey', 'content_reports_reporter_id_fkey',
         'content_reports_reviewed_by_fkey', 'files_channel_id_fkey', 'notifications_channel_id_fkey',
         'notifications_post_id_fkey', 'profiles_approval_reviewed_by_fkey', 'series_approved_by_fkey',
         'series_owner_id_fkey', 'subscription_requests_reviewed_by_fkey', 'user_blocks_blocked_id_fkey',
         'watch_history_post_id_fkey')
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
      INTO cols
      FROM unnest(r.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = k.attnum;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%s)', 'ix_fk_' || r.conname, r.tbl, cols);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS ix_channel_posts_channel_approved_recent
  ON public.channel_posts (channel_id, created_at DESC) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS ix_channel_posts_approved_recent
  ON public.channel_posts (created_at DESC) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS ix_channel_posts_approved_views
  ON public.channel_posts (view_count DESC) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS ix_notifications_user_recent
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notifications_user_unread
  ON public.notifications (user_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS ix_channels_active_public_members
  ON public.channels (member_count DESC) WHERE status = 'active' AND is_public = true;
