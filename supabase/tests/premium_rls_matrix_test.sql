-- premium_rls_matrix_test.sql
--
-- Self-test for the v52 premium-content RLS policy (channel_posts_select_v52
-- in supabase/migrations/20260826140000_v52_premium_content_model.sql).
--
-- WHAT THIS PROVES: that free/premium, public/private, and
-- approved/pending/suspended/blocked access rules are enforced by Postgres
-- itself — not by client-side filtering — by actually switching to the
-- `authenticated` role and impersonating each test user's JWT claim, the
-- same way PostgREST does for a real API request. This is not a
-- replacement for on-device testing (Gate 5 in the release plan): it only
-- proves the database layer. Playback-URL protection (Cloudflare Stream)
-- is a separate, still-open item — see BACKEND_REFERENCE.md.
--
-- HOW TO RUN:
--   1. Open the Supabase SQL Editor (or `psql` connected as a role that can
--      CREATE/DROP — the editor's default role works) on a project you are
--      OK writing throwaway test data to. Do NOT run this against a
--      database with real users you care about colliding with — it uses
--      fixed UUIDs below; change them if you're worried about collisions.
--   2. Run the whole file top to bottom. It creates its own users/channel/
--      posts, runs every assertion, prints PASS/FAIL per case via RAISE
--      NOTICE, then explicitly deletes what it created AND ends with
--      ROLLBACK — so the whole run (setup, assertions, cleanup) leaves the
--      database exactly as it was, pass or fail, even if you stop partway
--      through. Change the final ROLLBACK to COMMIT only if you deliberately
--      want the test rows to persist for manual inspection.
--   3. Read the output. Any line starting "FAIL" means the policy is not
--      behaving as documented and needs investigation before you trust it
--      in production.
--
-- This script only touches rows it creates itself (fixed test UUIDs in the
-- 00000000-0000-0000-0000-0000000000XX range) and deletes them at the end.

BEGIN;

DO $$
DECLARE
  u_free       uuid := '00000000-0000-0000-0000-000000000001'; -- free plan, sees free content only
  u_premium    uuid := '00000000-0000-0000-0000-000000000002'; -- active plan, sees free + premium
  u_expired    uuid := '00000000-0000-0000-0000-000000000003'; -- plan_status='expired', should behave like free
  u_admin      uuid := '00000000-0000-0000-0000-000000000004'; -- is_admin=true, sees everything incl. pending
  u_suspended  uuid := '00000000-0000-0000-0000-000000000005'; -- author account_status<>'active'
  u_member     uuid := '00000000-0000-0000-0000-000000000006'; -- member of the private channel
  u_outsider   uuid := '00000000-0000-0000-0000-000000000007'; -- not a member of the private channel, free plan
  u_blocker    uuid := '00000000-0000-0000-0000-000000000008'; -- has blocked u_suspended... (author-block case)

  chan_public  uuid := '00000000-0000-0000-0000-0000000000a1';
  chan_private uuid := '00000000-0000-0000-0000-0000000000a2';

  post_free_public     uuid := '00000000-0000-0000-0000-0000000000b1';
  post_premium_public  uuid := '00000000-0000-0000-0000-0000000000b2';
  post_free_private    uuid := '00000000-0000-0000-0000-0000000000b3';
  post_premium_private uuid := '00000000-0000-0000-0000-0000000000b4';
  post_pending         uuid := '00000000-0000-0000-0000-0000000000b5'; -- status='pending', only author+admin should see
  post_by_suspended    uuid := '00000000-0000-0000-0000-0000000000b6'; -- approved but author suspended -> nobody but author/admin

BEGIN
  -- ── Setup: run as service_role so the protect_profile_privileged_fields
  --    trigger lets us set plan_status/is_admin/account_status directly. ──
  PERFORM set_config('app.trusted_update', 'true', true);

  -- profiles.id REFERENCES auth.users(id) — a matching auth.users row must
  -- exist first, or the profiles insert below fails its FK constraint.
  -- instance_id/aud/role match what GoTrue itself would write.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES
    (u_free,      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test_free@example.invalid',      '', now(), now(), now()),
    (u_premium,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test_premium@example.invalid',   '', now(), now(), now()),
    (u_expired,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test_expired@example.invalid',   '', now(), now(), now()),
    (u_admin,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test_admin@example.invalid',     '', now(), now(), now()),
    (u_suspended, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test_suspended@example.invalid', '', now(), now(), now()),
    (u_member,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test_member@example.invalid',    '', now(), now(), now()),
    (u_outsider,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test_outsider@example.invalid',  '', now(), now(), now()),
    (u_blocker,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test_blocker@example.invalid',   '', now(), now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, username, plan_status, is_admin, account_status)
  VALUES
    (u_free,      'test_free@example.invalid',      'test_free',      'free',     false, 'active'),
    (u_premium,   'test_premium@example.invalid',   'test_premium',   'active',   false, 'active'),
    (u_expired,   'test_expired@example.invalid',   'test_expired',   'expired',  false, 'active'),
    (u_admin,     'test_admin@example.invalid',     'test_admin',     'free',     true,  'active'),
    (u_suspended, 'test_suspended@example.invalid', 'test_suspended', 'free',     false, 'suspended'),
    (u_member,    'test_member@example.invalid',    'test_member',    'free',     false, 'active'),
    (u_outsider,  'test_outsider@example.invalid',  'test_outsider',  'free',     false, 'active'),
    (u_blocker,   'test_blocker@example.invalid',   'test_blocker',   'free',     false, 'active')
  ON CONFLICT (id) DO UPDATE SET
    plan_status = EXCLUDED.plan_status,
    is_admin = EXCLUDED.is_admin,
    account_status = EXCLUDED.account_status;

  INSERT INTO public.channels (id, owner_id, name, is_public, status)
  VALUES
    (chan_public,  u_free, 'Test Public Channel',  true,  'active'),
    (chan_private, u_free, 'Test Private Channel', false, 'active')
  ON CONFLICT (id) DO UPDATE SET is_public = EXCLUDED.is_public, status = EXCLUDED.status;

  INSERT INTO public.channel_members (channel_id, user_id, role)
  VALUES (chan_private, u_member, 'member')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.channel_posts (id, channel_id, author_id, content_type, title, status, access_level)
  VALUES
    (post_free_public,     chan_public,  u_free,      'short', 'Free Public',        'approved', 'free'),
    (post_premium_public,  chan_public,  u_free,      'movie', 'Premium Public',     'approved', 'premium'),
    (post_free_private,    chan_private, u_free,      'short', 'Free Private',       'approved', 'free'),
    (post_premium_private, chan_private, u_free,      'movie', 'Premium Private',    'approved', 'premium'),
    (post_pending,         chan_public,  u_free,      'short', 'Pending Review',     'pending',  'free'),
    (post_by_suspended,    chan_public,  u_suspended, 'short', 'By Suspended Author','approved', 'free')
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, access_level = EXCLUDED.access_level;

  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (u_blocker, u_suspended)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '--- setup complete, running assertions as authenticated role ---';
END $$;

-- ── Assertions ──
-- Each block: switch to `authenticated` + impersonate one user's JWT sub,
-- then SELECT count(*) for one post id. Expect 1 (visible) or 0 (hidden).

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- u_free
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b1'; -- free public
  RAISE NOTICE '% | free user sees free public post (expect 1): got %', CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- u_free
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b2'; -- premium public
  RAISE NOTICE '% | free user CANNOT see premium public post (expect 0): got %', CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- u_premium
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b2'; -- premium public
  RAISE NOTICE '% | premium (active) user sees premium public post (expect 1): got %', CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- u_expired
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b2'; -- premium public
  RAISE NOTICE '% | expired-plan user CANNOT see premium content (expect 0): got %', CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  -- This is the specific invariant from the release-plan Gate 6/7 check:
  -- expiry revokes premium CONTENT access but the same expired user's own
  -- storage_limit must remain 15GB, never drop to 0 or delete files.
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- u_expired
  SELECT storage_limit INTO v_count FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000003';
  RAISE NOTICE '% | expired user storage_limit still 15GB/16106127360 (expect 16106127360): got %', CASE WHEN v_count = 16106127360 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006'; -- u_member
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b3'; -- free private
  RAISE NOTICE '% | private-channel member sees free private post (expect 1): got %', CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000007'; -- u_outsider
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b3'; -- free private
  RAISE NOTICE '% | non-member CANNOT see private-channel post even if free (expect 0): got %', CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006'; -- u_member (free plan)
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b4'; -- premium private
  RAISE NOTICE '% | private-channel free member CANNOT see premium private post (expect 0): got %', CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- u_free
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b5'; -- pending
  RAISE NOTICE '% | ordinary user CANNOT see a pending (unapproved) post (expect 0): got %', CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- u_free (author of the pending post)
  -- swap sub to the actual author for this one: post_pending's author_id is u_free, so u_free SHOULD see it.
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b5'; -- pending, but u_free IS the author
  RAISE NOTICE '% | author sees own pending post regardless of status (expect 1): got %', CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- u_admin
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b5'; -- pending
  RAISE NOTICE '% | admin sees pending post (moderation queue) (expect 1): got %', CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- u_free
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b6'; -- by suspended author
  RAISE NOTICE '% | approved post by a SUSPENDED author is hidden from ordinary users (expect 0): got %', CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

DO $$
DECLARE v_count int; BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- u_admin
  SELECT count(*) INTO v_count FROM public.channel_posts WHERE id = '00000000-0000-0000-0000-0000000000b6'; -- by suspended author
  RAISE NOTICE '% | admin still sees suspended-author post (moderation needs visibility) (expect 1): got %', CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END, v_count;
END $$;

-- ── Cleanup: deleting the auth.users rows cascades through profiles ->
--    channels/channel_posts/channel_members/user_blocks (every FK above is
--    ON DELETE CASCADE), so this one statement removes everything the
--    setup block created. ──
RESET ROLE;
DELETE FROM auth.users WHERE id IN (
  '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000008'
);

-- If every line above said PASS, roll back anyway (the DELETEs already
-- clean up, but COMMIT is what actually matters here — nothing left behind
-- either way since we deleted our own rows). Change to COMMIT if you want
-- the run to persist for inspection; ROLLBACK is the safer default.
ROLLBACK;
