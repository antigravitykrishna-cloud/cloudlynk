-- v63: guests can watch FREE content. Premium still asks for an account and a
-- subscription.
--
-- Supersedes the v61 rule that a guest needed an account to watch anything.
--
-- ═══════════════════════════════════════════════════════════════
-- WHY A VIEW AND NOT JUST A COLUMN GRANT
-- ═══════════════════════════════════════════════════════════════
--
-- To play a free video the client needs `video_url` — the Cloudflare Stream
-- UID. The obvious move is to add it to the anon column grant on
-- channel_posts. That would also hand out the UID of every PREMIUM post,
-- because a GRANT applies to a column across all rows; there is no such thing
-- as "this column, but only on rows where access_level = 'free'".
--
-- One could argue premium UIDs are harmless because v57 makes premium videos
-- require a signed URL. That argument has a hole: v57 locks videos at upload
-- and on the free -> premium transition, but a premium video uploaded BEFORE
-- v57 and never yet played is still unlocked, and its UID plays from a plain
-- URL. Handing those out and relying on a backfill nobody has run is not a
-- security boundary.
--
-- A view can filter by row, which is exactly the missing capability. This one
-- exposes media identifiers for free, approved, public posts and physically
-- cannot return a premium row.
--
-- security_invoker = false is deliberate and load-bearing. The view runs with
-- its owner's privileges, so it is not re-filtered by channel_posts' RLS or
-- blocked by anon's lack of a video_url column grant — the WHERE clause below
-- IS the access control. Read it as such: every condition in it is doing a
-- job, and loosening any one of them leaks something.

CREATE OR REPLACE VIEW public.free_post_media
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.video_url,
  p.media_url,
  p.media_type
FROM public.channel_posts p
JOIN public.channels c ON c.id = p.channel_id
WHERE p.status = 'approved'          -- never drafts, pending, rejected, removed
  AND p.access_level = 'free'        -- THE line that keeps premium out
  AND c.is_public = true             -- private channels need membership
  AND c.status = 'active'            -- suspended channels disappear
  AND NOT EXISTS (                   -- a banned creator's work stays hidden
    SELECT 1 FROM public.profiles ap
    WHERE ap.id = p.author_id AND ap.account_status <> 'active'
  );

REVOKE ALL ON public.free_post_media FROM PUBLIC;
GRANT SELECT ON public.free_post_media TO anon, authenticated;

COMMENT ON VIEW public.free_post_media IS
  'Media identifiers for free, approved, public posts only — the one thing a signed-out viewer needs in order to play free content. Runs security_invoker = false, so its WHERE clause is the access control rather than RLS. Premium rows cannot appear in it by construction, which is why anon is still not granted channel_posts.video_url directly: a column grant cannot be conditional on access_level, and premium videos uploaded before v57 are not all signed-locked yet.';

-- ═══════════════════════════════════════════════════════════════
-- What this does NOT change
-- ═══════════════════════════════════════════════════════════════
--
--   * anon still has no grant on channel_posts.video_url or media_url. The
--     view is the only way a guest reaches a media identifier, and it only
--     ever holds free ones.
--   * premium playback is untouched: it still needs a signed token from
--     stream-playback-token, which rejects an unauthenticated caller with 401
--     before it looks at anything else.
--   * a guest still cannot see private channels, unapproved posts, or any
--     column withheld by v61.
--
-- The client side of this is PostService.getFreeMedia() plus the branch in
-- app/(tabs)/explore.tsx that opens the player for free content and prompts
-- for an account only on premium.

NOTIFY pgrst, 'reload schema';
