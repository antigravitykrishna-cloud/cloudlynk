-- v75: make subscription expiry real.
--
-- The brief says "once the subscription expires, full access will be removed
-- automatically". It wasn't. Two independent gaps:
--
--   1. The RLS gate never looked at plan_expires_at. channel_posts_select_v57
--      (created in v57, re-scoped in v67) entitled a caller on
--
--          profiles.plan_status IN ('active', 'lifetime')
--
--      alone. plan_expires_at could be a year in the past and the row still
--      came back. stream-playback-token/index.ts:131 DOES check it
--      (`notExpired`), so the two layers disagreed: an expired subscriber kept
--      reading the whole premium catalogue over PostgREST — titles, bodies,
--      thumbnails, video_url — and only discovered it was over when they
--      pressed play and got a 403. The app hid it because hooks/useAuth.ts:276
--      computes isActive with the expiry, but the API is the security boundary
--      and the API was still answering.
--
--      v56 left a comment about exactly this class of bug — a grant holder who
--      "would see the post in the feed and then get a 403 the moment they
--      pressed play — visibly broken, and the exact half-built failure this
--      layer exists to prevent". Same failure, different branch of the same
--      condition.
--
--   2. Nothing moved a lapsed plan out of 'active'. play-rtdn-webhook handles
--      Play-originated events, but only for subscriptions Google tells us
--      about, only once Pub/Sub is wired, and never for rows written by
--      admin_set_plan or by a plan that simply ran out its term. So even with
--      (1) fixed, plan_status stays 'active' forever and "expired subscribers
--      managed separately" has nothing to filter on.
--
-- Fixes both, and adds the expiry notification the brief asks for.
--
-- ═══════════════════════════════════════════════════════════════
-- 1. One definition of "is this subscription live right now"
-- ═══════════════════════════════════════════════════════════════
--
-- Deliberately mirrors stream-playback-token/index.ts:131 line for line:
--
--     const notExpired = !me.plan_expires_at || new Date(me.plan_expires_at) > new Date();
--     const paid = me.plan_status === "lifetime" || (me.plan_status === "active" && notExpired);
--
-- 'lifetime' ignores plan_expires_at entirely (a lifetime plan with a stray
-- expiry date is still lifetime). 'active' requires the date to be absent or
-- in the future. A NULL expiry on an 'active' plan means "no known end" and
-- stays open — that is how verify-play-receipt writes a plan whose term Google
-- has not returned yet, so treating NULL as expired would revoke access from
-- people who just paid.
--
-- SECURITY DEFINER for the same reason is_profile_active is (v66): the policy
-- has to read plan columns the caller cannot select directly.

CREATE OR REPLACE FUNCTION public.is_plan_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Defaults to false for a missing profile: no profile, no entitlement.
  SELECT coalesce(
    (
      SELECT p.plan_status = 'lifetime'
          OR (
            p.plan_status = 'active'
            AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())
          )
      FROM public.profiles p
      WHERE p.id = p_user_id
    ),
    false
  );
$$;

REVOKE ALL   ON FUNCTION public.is_plan_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_plan_active(uuid) TO authenticated;  -- v77: anon removed, see that migration

COMMENT ON FUNCTION public.is_plan_active(uuid) IS
  'True when the user holds a subscription that is live right now: lifetime, or active with plan_expires_at absent or in the future. Single source of truth for the premium gate (v75) — RLS and stream-playback-token must never disagree about this. SECURITY DEFINER so policies can test plan state without plan columns being readable by the caller.';

-- ═══════════════════════════════════════════════════════════════
-- 2. Re-create the authenticated read policy on top of it
-- ═══════════════════════════════════════════════════════════════
--
-- Byte-for-byte the v67 policy except for the entitlement branch. Everything
-- else — author sees own, admin sees all, approved-only, active author, block
-- list, member-or-public-channel reachability, per-post grants — is carried
-- over unchanged, so this migration cannot widen access by accident.
--
-- Guests are unaffected: channel_posts_select_anon (v61/v66) is TO anon and
-- shows the locked premium catalogue on purpose, as the signup incentive. A
-- guest has no plan to expire, and the column-level GRANT still withholds
-- video_url from them.

DROP POLICY IF EXISTS channel_posts_select_v57 ON public.channel_posts;

CREATE POLICY channel_posts_select_v57
  ON public.channel_posts FOR SELECT
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
    OR (
      status = 'approved'
      AND EXISTS (
        SELECT 1 FROM public.profiles vp
        WHERE vp.id = auth.uid() AND vp.account_status = 'active'
      )
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
          WHERE channel_members.channel_id = channel_posts.channel_id
            AND channel_members.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.channels
          WHERE channels.id = channel_posts.channel_id
            AND channels.is_public = true
            AND channels.status = 'active'
        )
      )
      AND (
        access_level = 'free'
        -- v75: was `plan_status IN ('active','lifetime')`, which ignored the
        -- expiry date. This is the whole point of the migration.
        OR public.is_plan_active(auth.uid())
        OR public.has_content_access(channel_posts.id, auth.uid())
      )
    )
  );

COMMENT ON POLICY channel_posts_select_v57 ON public.channel_posts IS
  'Authenticated read gate. v75: the premium branch now calls is_plan_active(), so an expired subscription stops returning premium rows here exactly when it stops minting playback tokens. Previously entitled on plan_status alone and ignored plan_expires_at.';

-- ═══════════════════════════════════════════════════════════════
-- 3. Notification types for billing events
-- ═══════════════════════════════════════════════════════════════
--
-- The notifications table predates this migration set and is not created by
-- any file in supabase/migrations, so its constraints are whatever the
-- dashboard has. If a CHECK on `type` exists it will reject the new values, and
-- the sweeper below would fail on its first lapsed row. Widen it if present;
-- do nothing if the column is unconstrained.

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'notifications'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%type%'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check_v75
    CHECK (type IN (
      'channel_approved',
      'channel_rejected',
      'post_approved',
      'post_rejected',
      -- v75
      'subscription_expiring',
      'subscription_expired'
    ));
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 4. The sweeper
-- ═══════════════════════════════════════════════════════════════
--
-- Moves lapsed plans 'active' -> 'expired' and notifies the user once.
--
-- Writes through apply_play_entitlement rather than UPDATE-ing profiles
-- directly: plan_status is a protected column
-- (protect_profile_privileged_fields, and see v58 for what happens when a
-- privileged write takes the wrong path — the UPDATE succeeds, the trigger
-- silently reverts it, and nothing is logged). Going through the same RPC the
-- billing functions use means this cannot rediscover that bug. It already
-- accepts 'expired' as a legitimate state.
--
-- plan_expires_at is passed back in unchanged rather than nulled. The date is
-- the record of WHEN access lapsed — the admin cohort view and the user's own
-- "expired on ..." copy both read it, and apply_play_entitlement overwrites
-- the column with whatever it is given.
--
-- 'cancelled' is intentionally NOT swept. A cancelled subscription still runs
-- to the end of its paid term; the RLS gate above already stops entitling it
-- once plan_expires_at passes, and rewriting the status would lose the
-- distinction between "user cancelled" and "term ran out" that the brief's
-- "expired subscribers should be managed separately" depends on.

CREATE OR REPLACE FUNCTION public.expire_lapsed_plans()
RETURNS TABLE (expired_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.id, p.plan_expires_at
    FROM public.profiles p
    WHERE p.plan_status = 'active'
      AND p.plan_expires_at IS NOT NULL
      AND p.plan_expires_at <= now()
    -- Bounded so one long-dormant deployment cannot turn the first cron tick
    -- into an unbounded write. Whatever is left is picked up next tick.
    LIMIT 500
  LOOP
    PERFORM public.apply_play_entitlement(r.id, 'expired', r.plan_expires_at);

    INSERT INTO public.notifications (user_id, type, title, body, read)
    VALUES (
      r.id,
      'subscription_expired',
      'Your subscription has ended',
      'Your premium access expired on '
        || to_char(r.plan_expires_at, 'DD Mon YYYY')
        || '. Renew any time to unlock full content again.',
      false
    );

    n := n + 1;
  END LOOP;

  RETURN QUERY SELECT n;
END $$;

-- service_role only. v60 caught the mirror-image mistake — a scheduled sweeper
-- GRANTed to `authenticated`, letting any signed-in user run an unrate-limited
-- batch UPDATE with no audit trail. This one is never callable from the app.
REVOKE ALL ON FUNCTION public.expire_lapsed_plans() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_lapsed_plans() TO service_role;

COMMENT ON FUNCTION public.expire_lapsed_plans() IS
  'Scheduled sweeper (v75). Moves plan_status active -> expired once plan_expires_at has passed and notifies the user. service_role only — drive it from pg_cron. Access revocation itself does NOT depend on this running: is_plan_active() already ignores a lapsed date. This exists so expired subscribers are queryable as a cohort and get told.';

-- ═══════════════════════════════════════════════════════════════
-- 5. Warn before it lapses
-- ═══════════════════════════════════════════════════════════════
--
-- Three days out, once per subscription term. The "once" is enforced by
-- matching on plan_expires_at inside the body text rather than a new column,
-- so a renewal (which moves plan_expires_at) is eligible for its own warning
-- while a re-run on the same term is not.

CREATE OR REPLACE FUNCTION public.notify_expiring_plans(p_days_ahead integer DEFAULT 3)
RETURNS TABLE (notified_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n integer := 0;
  marker text;
BEGIN
  FOR r IN
    SELECT p.id, p.plan_expires_at
    FROM public.profiles p
    WHERE p.plan_status = 'active'
      AND p.plan_expires_at IS NOT NULL
      AND p.plan_expires_at > now()
      AND p.plan_expires_at <= now() + make_interval(days => p_days_ahead)
    LIMIT 500
  LOOP
    marker := to_char(r.plan_expires_at, 'YYYY-MM-DD"T"HH24:MI:SSOF');

    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = r.id
        AND type = 'subscription_expiring'
        AND body LIKE '%' || marker || '%'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, read)
    VALUES (
      r.id,
      'subscription_expiring',
      'Your subscription ends soon',
      'Your premium access ends on '
        || to_char(r.plan_expires_at, 'DD Mon YYYY')
        || '. Renew to keep watching full content. [' || marker || ']',
      false
    );

    n := n + 1;
  END LOOP;

  RETURN QUERY SELECT n;
END $$;

REVOKE ALL ON FUNCTION public.notify_expiring_plans(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_expiring_plans(integer) TO service_role;

COMMENT ON FUNCTION public.notify_expiring_plans(integer) IS
  'Scheduled reminder (v75). Warns subscribers p_days_ahead before plan_expires_at, at most once per term. service_role only — drive it from pg_cron.';

-- ═══════════════════════════════════════════════════════════════
-- 6. Schedule both
-- ═══════════════════════════════════════════════════════════════
--
-- Hourly rather than daily: the gate is already correct the instant the date
-- passes, so this is only about how quickly the status column and the
-- notification catch up. Guarded because pg_cron is an extension a project may
-- not have enabled — a missing extension must not fail the whole migration and
-- leave the policy fix unapplied. If this block is skipped, schedule both
-- functions by hand (see DEPLOY.md).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cloudlynk-expire-lapsed-plans')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cloudlynk-expire-lapsed-plans');
    PERFORM cron.unschedule('cloudlynk-notify-expiring-plans')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cloudlynk-notify-expiring-plans');

    PERFORM cron.schedule(
      'cloudlynk-expire-lapsed-plans',
      '7 * * * *',
      $cron$SELECT public.expire_lapsed_plans();$cron$
    );
    PERFORM cron.schedule(
      'cloudlynk-notify-expiring-plans',
      '37 9 * * *',
      $cron$SELECT public.notify_expiring_plans(3);$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — expire_lapsed_plans() and notify_expiring_plans() were created but NOT scheduled. See DEPLOY.md.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 7. Admin: subscribers as cohorts
-- ═══════════════════════════════════════════════════════════════
--
-- "Expired subscribers should be managed separately" needs something to
-- separate them BY. admin_search_users (v56) returns plan_status and
-- plan_expires_at but only filters on email/name, so finding everyone whose
-- plan lapsed meant paging the whole user table and filtering client-side —
-- which quietly stops being correct past its 200-row limit.
--
-- 'expired' deliberately includes rows still sitting at plan_status='active'
-- with a past date. Those are users the sweeper has not reached yet (it runs
-- hourly, in batches of 500). They have already lost access — is_plan_active()
-- says so — so an admin screen that showed them as active would be lying about
-- the thing it exists to report.

CREATE OR REPLACE FUNCTION public.admin_list_subscribers(
  p_cohort text DEFAULT 'expired',
  p_query  text DEFAULT NULL,
  p_limit  int  DEFAULT 50
) RETURNS TABLE (
  id              uuid,
  email           text,
  full_name       text,
  plan_status     text,
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  account_status  text,
  created_at      timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_cohort NOT IN ('active', 'expiring', 'expired', 'cancelled', 'free') THEN
    RAISE EXCEPTION 'Unknown cohort: %', p_cohort USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.plan_status,
         p.plan_started_at, p.plan_expires_at, p.account_status, p.created_at
  FROM public.profiles p
  WHERE (
      p_query IS NULL
      OR btrim(p_query) = ''
      OR p.email ILIKE '%' || btrim(p_query) || '%'
      OR coalesce(p.full_name, '') ILIKE '%' || btrim(p_query) || '%'
    )
    AND CASE p_cohort
      WHEN 'active' THEN
        public.is_plan_active(p.id)
      WHEN 'expiring' THEN
        p.plan_status = 'active'
        AND p.plan_expires_at IS NOT NULL
        AND p.plan_expires_at > now()
        AND p.plan_expires_at <= now() + interval '7 days'
      WHEN 'expired' THEN
        p.plan_status = 'expired'
        OR (
          p.plan_status = 'active'
          AND p.plan_expires_at IS NOT NULL
          AND p.plan_expires_at <= now()
        )
      WHEN 'cancelled' THEN
        p.plan_status = 'cancelled'
      WHEN 'free' THEN
        coalesce(p.plan_status, 'free') = 'free'
    END
  -- Most-recently-lapsed first for the cohort this screen exists for; nulls
  -- (free users, who have no date) sort last rather than heading the list.
  ORDER BY p.plan_expires_at DESC NULLS LAST, p.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$$;

REVOKE ALL   ON FUNCTION public.admin_list_subscribers(text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_subscribers(text, text, int) TO authenticated;

COMMENT ON FUNCTION public.admin_list_subscribers(text, text, int) IS
  'Admin subscriber cohorts (v75): active / expiring / expired / cancelled / free. Filters server-side so the expired cohort stays correct past the row limit. Admin check is inside the function — EXECUTE to authenticated is the pattern used by admin_search_users (v56), not an access grant.';

-- Counts for the cohort tabs. Separate from the listing so the screen can show
-- every tab's size without fetching five full pages of rows.
CREATE OR REPLACE FUNCTION public.admin_subscriber_counts()
RETURNS TABLE (
  active_count    integer,
  expiring_count  integer,
  expired_count   integer,
  cancelled_count integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (
      WHERE p.plan_status = 'lifetime'
         OR (p.plan_status = 'active' AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now()))
    )::integer,
    count(*) FILTER (
      WHERE p.plan_status = 'active'
        AND p.plan_expires_at IS NOT NULL
        AND p.plan_expires_at > now()
        AND p.plan_expires_at <= now() + interval '7 days'
    )::integer,
    count(*) FILTER (
      WHERE p.plan_status = 'expired'
         OR (p.plan_status = 'active' AND p.plan_expires_at IS NOT NULL AND p.plan_expires_at <= now())
    )::integer,
    count(*) FILTER (WHERE p.plan_status = 'cancelled')::integer
  FROM public.profiles p;
END;
$$;

REVOKE ALL   ON FUNCTION public.admin_subscriber_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_subscriber_counts() TO authenticated;

COMMENT ON FUNCTION public.admin_subscriber_counts() IS
  'Cohort sizes for the admin Subscribers screen (v75). Inlines the is_plan_active predicate rather than calling it per row — one table scan instead of one function call per profile.';

NOTIFY pgrst, 'reload schema';
