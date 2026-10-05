-- ============================================================
-- Pre-launch test-data cleanup — Streamly v0.7.0
-- ============================================================
-- Generated: 2026-08-03 (Phase 2 of launch-hardening)
--
-- HOW TO USE THIS FILE — READ BEFORE RUNNING ANYTHING:
--
--   1. BACKUP FIRST. Use the existing pre-launch backups if still fresh
--      (backups/pre-launch-backup-2026-08-03.sql + ...-data-2026-08-03.sql),
--      or take a new one: `npx supabase db dump --linked --data-only --file backups/pre-cleanup-<date>.sql`
--   2. Run SECTION 1 (read-only preview) first, in the Supabase SQL editor.
--      Read every result. Confirm the candidate list is actually test data,
--      not real users/content.
--   3. Only if Section 1 looks right, run SECTION 2 inside its transaction.
--      It STOPS before COMMIT — you must explicitly run COMMIT or ROLLBACK
--      yourself after reviewing the row-count sanity check it prints.
--   4. Section 3 (view count reset) is separate and optional — skip it if
--      you already have organic view counts you want to keep.
--   5. Section 4 (storage) is preview-only. This script does not delete any
--      files from storage buckets — see the comment in that section for why.
--
-- THIS SCRIPT IS NOT RUN AUTOMATICALLY. It is written for a human to read,
-- adjust, and execute manually, one section at a time, via the Supabase
-- SQL editor (or `supabase db query --linked -f <this file>` a section at
-- a time). Nothing in here has been executed as part of this commit.
--
-- CASCADE NOTE: every table that stores per-user data references
-- `public.profiles(id)` or `auth.users(id)` with `ON DELETE CASCADE`
-- (verified against schema.sql and every migration in this repo, and
-- cross-checked against supabase/functions/delete-account/index.ts, which
-- enumerates the same table list for single-user deletion). Deleting a row
-- from `auth.users` therefore cascades through: profiles, channels,
-- channel_members, channel_posts, channel_videos, files, transfers,
-- content_reports, subscription_requests, watch_history, notifications,
-- stream_videos, series, user_preferences, upload_rate_limit_log. You do
-- NOT need to delete from each of those tables individually.
--
-- WHAT THIS SCRIPT DELIBERATELY DOES NOT DO: the original brief for this
-- task suggested also deleting "users created in the last 30 days during
-- dev." That heuristic is NOT applied below as an active filter — on a
-- pre-launch app, "created in the last 30 days" cannot reliably distinguish
-- a test account from a real early adopter, and blanket-deleting on that
-- basis risks destroying real signups. It's included only as a read-only
-- preview query (1b) so you can eyeball it and decide manually.

-- ============================================================
-- SECTION 1 — PREVIEW (read-only, safe to run any time, changes nothing)
-- ============================================================

-- 1a. Users matching clear test-account email patterns
SELECT id, email, created_at
FROM auth.users
WHERE email ILIKE '%test%' OR email ILIKE '%example%'
ORDER BY created_at DESC
LIMIT 5;
-- Remove the LIMIT above to see the full candidate list before deciding.

-- 1b. [INFORMATIONAL ONLY — not used by Section 2] Users created in the
--     last 30 days. Review individually; do NOT treat this as "safe to
--     delete" without checking each one.
SELECT id, email, created_at
FROM auth.users
WHERE created_at > now() - interval '30 days'
ORDER BY created_at DESC
LIMIT 5;

-- 1c. Channels owned by 1a's candidate test users
SELECT c.id, c.name, c.owner_id, p.email, c.created_at
FROM public.channels c
JOIN public.profiles p ON p.id = c.owner_id
WHERE p.email ILIKE '%test%' OR p.email ILIKE '%example%'
ORDER BY c.created_at DESC
LIMIT 5;

-- 1d. Posts authored by 1a's candidate test users
SELECT cp.id, cp.title, cp.author_id, p.email, cp.created_at
FROM public.channel_posts cp
JOIN public.profiles p ON p.id = cp.author_id
WHERE p.email ILIKE '%test%' OR p.email ILIKE '%example%'
ORDER BY cp.created_at DESC
LIMIT 5;

-- 1e. [SEPARATE FROM 1a — catches test CONTENT made by non-test-pattern
--      accounts] Channels/posts whose own name/title looks like test data.
--      Review carefully: a real channel could legitimately be named
--      something containing "test" (e.g. "Test Kitchen Vlogs") — this is a
--      preview to inform a manual decision, not a recommendation to delete
--      every match.
SELECT id, name, owner_id, created_at
FROM public.channels
WHERE name ILIKE '%test%'
ORDER BY created_at DESC
LIMIT 5;

SELECT id, title, author_id, created_at
FROM public.channel_posts
WHERE title ILIKE '%test%'
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================
-- SECTION 2 — Delete test users (transaction; review before COMMIT)
-- ============================================================

BEGIN;

-- Sanity-check row counts BEFORE deleting. Compare these to what Section 1
-- showed you. If a number here looks way bigger than expected, ROLLBACK.
WITH doomed AS (
  SELECT id FROM auth.users WHERE email ILIKE '%test%' OR email ILIKE '%example%'
)
SELECT
  (SELECT count(*) FROM doomed)                                                          AS users_to_delete,
  (SELECT count(*) FROM public.channels           WHERE owner_id  IN (SELECT id FROM doomed)) AS channels_cascading,
  (SELECT count(*) FROM public.channel_posts      WHERE author_id IN (SELECT id FROM doomed)) AS posts_cascading,
  (SELECT count(*) FROM public.channel_videos     WHERE uploaded_by IN (SELECT id FROM doomed)) AS channel_videos_cascading,
  (SELECT count(*) FROM public.subscription_requests WHERE user_id IN (SELECT id FROM doomed)) AS subscription_requests_cascading,
  (SELECT count(*) FROM public.watch_history      WHERE user_id  IN (SELECT id FROM doomed)) AS watch_history_cascading;

DELETE FROM auth.users
WHERE email ILIKE '%test%' OR email ILIKE '%example%';

-- ^ That DELETE has run inside this open transaction but is NOT yet
--   permanent. Read the row counts above and the "DELETE n" result from
--   the statement itself, then explicitly run exactly one of:
--
--     COMMIT;
--     ROLLBACK;
--
-- Nothing is final until you run COMMIT yourself.

-- ============================================================
-- SECTION 3 — Reset view counts (separate, optional, low risk)
-- ============================================================
-- All current view_count values accumulated during development/testing.
-- Safe to zero out before real users start watching. SKIP this section if
-- you already have organic traffic/view counts you want to keep.

BEGIN;

SELECT count(*) AS posts_with_nonzero_views FROM public.channel_posts WHERE view_count > 0;

UPDATE public.channel_posts SET view_count = 0 WHERE view_count > 0;

-- Again: explicitly run one of:
--   COMMIT;
--   ROLLBACK;

-- ============================================================
-- SECTION 4 — Orphaned storage files (PREVIEW ONLY — nothing auto-deleted)
-- ============================================================
-- storage.objects has no foreign key to the app's own tables, so Section 2's
-- cascade delete does NOT remove the underlying files from storage. These
-- queries only list candidates for manual review; they do not delete
-- anything. Deliberately not automated: some columns
-- (channel_posts.media_url/thumbnail_url, series.thumbnail_url) can hold
-- either a bare storage path or a full https:// URL depending on how the
-- row was created, and getting that extraction wrong from raw SQL risks
-- deleting the wrong file. supabase/functions/delete-account/index.ts
-- already implements this path-extraction correctly for single-user
-- deletion (see `extractStoragePath` / `collectUserStoragePaths`) — mirror
-- that logic (or call it per test user) if you want this scripted instead
-- of reviewed by hand.

-- user-files objects with no matching public.files row
SELECT o.name, o.bucket_id, o.created_at
FROM storage.objects o
WHERE o.bucket_id = 'user-files'
  AND NOT EXISTS (SELECT 1 FROM public.files f WHERE f.storage_path = o.name)
ORDER BY o.created_at DESC
LIMIT 5;

-- payment-screenshots objects with no matching subscription_requests row
SELECT o.name, o.bucket_id, o.created_at
FROM storage.objects o
WHERE o.bucket_id = 'payment-screenshots'
  AND NOT EXISTS (SELECT 1 FROM public.subscription_requests s WHERE s.screenshot_path = o.name)
ORDER BY o.created_at DESC
LIMIT 5;

-- channel-videos objects with no matching channel_videos row (storage_path or thumbnail_path)
SELECT o.name, o.bucket_id, o.created_at
FROM storage.objects o
WHERE o.bucket_id = 'channel-videos'
  AND NOT EXISTS (
    SELECT 1 FROM public.channel_videos cv
    WHERE cv.storage_path = o.name OR cv.thumbnail_path = o.name
  )
ORDER BY o.created_at DESC
LIMIT 5;

-- channel-media objects: only catches bare-path matches (see note above —
-- rows storing a full URL instead of a bare path will show as false-positive
-- "orphans" here; verify manually before deleting anything from this list).
SELECT o.name, o.bucket_id, o.created_at
FROM storage.objects o
WHERE o.bucket_id = 'channel-media'
  AND NOT EXISTS (
    SELECT 1 FROM public.channel_posts cp
    WHERE cp.media_url = o.name OR cp.thumbnail_url = o.name
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.series s WHERE s.thumbnail_url = o.name
  )
ORDER BY o.created_at DESC
LIMIT 5;
