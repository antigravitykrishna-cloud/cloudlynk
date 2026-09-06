-- v57: three unrelated corrections that share one migration because they are
-- all small and all block the release.
--
--   1. Playback did not care whether the VIEWER was suspended or banned.
--   2. stream-set-access needed a way to CACHE a lock (it could only clear one).
--   3. The pre-Play-Billing manual payment system was still live in the
--      database months after its UI was deleted.
--
-- ═══════════════════════════════════════════════════════════════
-- 1. admin_set_signed_lock — the missing half of admin_clear_signed_lock
-- ═══════════════════════════════════════════════════════════════
--
-- v56 shipped only the "clear" direction, because at the time the only thing
-- that ever SET the flag was stream-playback-token, using the service-role
-- client where RLS does not apply. v57 moves the lock earlier — into
-- stream-set-access, on the free -> premium transition, which runs on the
-- CALLER-scoped client — so there now has to be an admin-gated way to set it.
--
-- Mirrors admin_clear_signed_lock exactly, including re-verifying is_admin in
-- the body rather than trusting the caller. Every admin RPC in this schema
-- does its own check; the isAdmin tests in the screens are UX only.

CREATE OR REPLACE FUNCTION public.admin_set_signed_lock(p_stream_uid text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.stream_videos SET signed_locked = true WHERE stream_uid = p_stream_uid;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.admin_set_signed_lock(text) TO authenticated;

COMMENT ON FUNCTION public.admin_set_signed_lock(text) IS
  'Caches that a Cloudflare video now requires signed URLs. Called by stream-set-access after it locks the video on the free -> premium transition. Advisory cache only — stream-playback-token re-asserts the lock on Cloudflare if this is false.';

-- ═══════════════════════════════════════════════════════════════
-- 2. The viewer's own account standing
-- ═══════════════════════════════════════════════════════════════
--
-- What was wrong: channel_posts_select_v56 checks account_status on the post's
-- AUTHOR, so a banned creator's work vanishes from every feed. It never
-- checked the account_status of the person DOING the reading.
-- has_content_access does check it, so admin grants died with a ban — but the
-- paid-subscription branch did not, so a suspended or banned account holding
-- plan_status 'active'/'lifetime' kept full premium access, feed and playback
-- both, until its refresh token expired.
--
-- Only the third branch is gated. Deliberately NOT gated:
--   * author_id = auth.uid() — a suspended user can still see their own posts.
--     Hiding someone's own library from them is a punishment nobody asked for,
--     and it would break the appeal/export flows that suspension implies.
--   * the is_admin branch — an admin's own moderation view must keep working.
--
-- The matching hard block for playback lives in the stream-playback-token edge
-- function, which now rejects a non-active caller before it mints anything,
-- for free content as well as premium. Both layers, because RLS governs what
-- the feed shows and the edge function governs what Cloudflare hands over, and
-- a ban has to mean both.

DROP POLICY IF EXISTS channel_posts_select_v56 ON public.channel_posts;

CREATE POLICY channel_posts_select_v57
  ON public.channel_posts FOR SELECT
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
    OR (
      status = 'approved'
      -- v57: the reader's own standing. Everything below this line is
      -- carried over verbatim from channel_posts_select_v56.
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
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.plan_status IN ('active', 'lifetime')
        )
        OR public.has_content_access(channel_posts.id, auth.uid())
      )
    )
  );

COMMENT ON POLICY channel_posts_select_v57 ON public.channel_posts IS
  'Successor to channel_posts_select_v56. Adds the viewer own account_status to the public-feed branch; author-sees-own and admin-sees-all are intentionally exempt. Exactly one SELECT policy must exist on this table — two would OR together and widen access.';

-- ═══════════════════════════════════════════════════════════════
-- 3. Retire the manual payment system
-- ═══════════════════════════════════════════════════════════════
--
-- Background, because this is the part that must not be reintroduced by
-- someone reading only the schema:
--
-- Cloudlynk originally unlocked Premium through a UPI deep link. The user paid
-- out-of-band, uploaded a screenshot of the transaction, and an admin looked
-- at it and clicked approve, which flipped profiles.plan_status. That flow is
-- Finding 1 of docs/PLAY_STORE_COMPLIANCE_AUDIT.md and a documented
-- contributor to the app's removal from Google Play: payment for in-app
-- digital content taken outside Play Billing, and — separately and worse — an
-- entitlement withheld after payment pending a human click.
--
-- The UI was deleted. The database was not. Until this migration:
--   * subscription_requests still existed, with live RLS
--   * approve_subscription_request / reject_subscription_request were still
--     GRANTed to `authenticated`, so any admin could still flip plan_status
--     over raw PostgREST with no app screen involved
--   * the payment-screenshots bucket still accepted uploads from any
--     authenticated user into their own folder
--
-- Two contradictory subscription systems in one production database, one of
-- them the banned one, still reachable. This removes the banned one.
--
-- What replaces it, and where the admin control the owner actually wants now
-- lives:
--   * WHO MAY BUY  -> profiles.approval_status (v55), a PRE-purchase gate.
--     An unapproved account never reaches the plan list. This is the legal
--     shape: Play's Payments policy governs not withholding what was paid
--     for, and says nothing about who you admit to your app.
--   * WHO GETS WHAT CONTENT -> content_access_grants (v56), per-user
--     per-post, entirely independent of payment.
--   * ENTITLEMENT AFTER PAYMENT -> verify-play-receipt, which grants the plan
--     unconditionally and deliberately does not read approval_status.
--
-- Do not re-add a post-payment approval step. See the header of
-- 20260905120000_v55_user_approval_gate.sql.

DROP FUNCTION IF EXISTS public.approve_subscription_request(uuid);
DROP FUNCTION IF EXISTS public.approve_subscription_request(uuid, uuid);
DROP FUNCTION IF EXISTS public.reject_subscription_request(uuid, text);
DROP FUNCTION IF EXISTS public.reject_subscription_request(uuid, text, uuid);

-- The table is neither dropped nor moved. It holds real money records — UPI
-- transaction references and amounts — that India's tax retention rules say to
-- keep for seven years (docs/privacy-policy-outline.md).
--
-- An earlier draft of this migration did `ALTER TABLE ... SET SCHEMA retired`.
-- That would have broken the GDPR/DPDPA data-export feature: export_my_data()
-- (migration_v30_fix_export_my_data.sql:43) reads
-- `from public.subscription_requests sr`, and it is SECURITY DEFINER with
-- `SET search_path = public`, so the moved table would not resolve and every
-- account export would fail. Caught in pre-flight review, not in production.
--
-- REVOKE achieves the actual goal — unreachable from the app — without that
-- side effect. PostgREST executes as the caller's role, so with no grants to
-- `authenticated` or `anon` the table cannot be read or written from the app
-- at all. export_my_data keeps working because SECURITY DEFINER runs as the
-- function owner, which retains access.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscription_requests'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.subscription_requests FROM authenticated, anon';
    EXECUTE $c$COMMENT ON TABLE public.subscription_requests IS 'RETIRED v57. The pre-Play-Billing UPI + screenshot + manual-approval flow (PLAY_STORE_COMPLIANCE_AUDIT.md Finding 1). All grants revoked; unreachable from the app. Retained only for the 7-year tax retention on the payment references it holds, and still read by export_my_data() for account data exports. Do not re-grant. Do not build on it.'$c$;
  END IF;
END $mig$;

-- The screenshot bucket: stop accepting new uploads. The objects stay for the
-- same retention reason; delete-account still purges a departing user's
-- screenshots from it, which is why the bucket itself is left in place.
DROP POLICY IF EXISTS "payment-screenshots owner upload" ON storage.objects;
DROP POLICY IF EXISTS "payment-screenshots owner read own" ON storage.objects;
DROP POLICY IF EXISTS "payment-screenshots admin read all" ON storage.objects;
DROP POLICY IF EXISTS "payment-screenshots admin write" ON storage.objects;

UPDATE storage.buckets SET public = false WHERE id = 'payment-screenshots';

NOTIFY pgrst, 'reload schema';
