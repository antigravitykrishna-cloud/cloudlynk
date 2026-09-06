-- v61: let signed-out visitors browse Explore.
--
-- Product change: the app currently forces a login before anything is visible.
-- It should open on Explore, let anyone browse, and ask for an account only at
-- the moment of watching — free content needs a login, premium needs a login
-- and a subscription.
--
-- ═══════════════════════════════════════════════════════════════
-- WHY A CLIENT-ONLY CHANGE WOULD NOT HAVE WORKED
-- ═══════════════════════════════════════════════════════════════
--
-- Every branch of channel_posts_select_v57 tests auth.uid(), which is NULL for
-- the `anon` role. Removing the login redirect on its own would have shipped an
-- app that opens on a permanently empty Explore, with no error to explain it.
--
-- ═══════════════════════════════════════════════════════════════
-- THE TRAP: RLS ALONE IS NOT ENOUGH HERE
-- ═══════════════════════════════════════════════════════════════
--
-- lib/posts.ts selects `*`. If a guest could read whole rows they would get
-- `video_url` — the Cloudflare Stream UID — and free videos play from a plain
-- unsigned URL built from exactly that UID. A guest would be able to watch
-- every free video without ever signing in, which is the opposite of the
-- requirement.
--
-- RLS filters ROWS, never COLUMNS. So the protection here is a column-level
-- GRANT: `anon` is given SELECT on the presentation columns only, and
-- `video_url` and `media_url` are simply not among them. PostgREST then
-- rejects `select=*` for anon with a permission error rather than leaking the
-- UID, which is why lib/posts.ts must name its columns explicitly on the guest
-- path (see GUEST_POST_COLUMNS there).
--
-- Premium posts ARE visible to guests, deliberately: seeing the locked catalogue
-- is what makes signing up worth doing. Only the metadata is exposed, and the
-- video behind it stays signed-URL protected by v57.

-- ═══════════════════════════════════════════════════════════════
-- 1. channel_posts — presentation columns only
-- ═══════════════════════════════════════════════════════════════

REVOKE ALL ON public.channel_posts FROM anon;

GRANT SELECT (
  id, channel_id, author_id, title, body,
  content_type, access_level, genre, duration_min,
  release_year, season_number, episode_number, episode_title,
  series_id, tags, media_type, thumbnail_url, is_short,
  view_count, status, created_at
) ON public.channel_posts TO anon;

-- Deliberately NOT granted, and each for its own reason:
--   video_url    the Cloudflare UID. Granting it lets a guest play every free
--                video from a plain unsigned URL. This is the whole point.
--   media_url    same, for image/video posts served from Supabase Storage.
--   trailer_url  also a Stream UID. Trailers are arguably meant to be public
--                and would convert well on the Explore page, but they carry
--                the same leak shape, so wiring them up is its own change.
--   visibility   the ad-attribution cloaking column from PLAY_STORE_COMPLIANCE
--                _AUDIT Finding 0. Dormant, and nothing should start reading it.
--   approved_by / approved_at / rejection_note / submitted_at
--                moderation trail; none of a visitor's business.

CREATE POLICY channel_posts_select_anon
  ON public.channel_posts FOR SELECT
  TO anon
  USING (
    status = 'approved'
    -- A suspended or banned creator's work stays hidden from guests too.
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles ap
      WHERE ap.id = channel_posts.author_id AND ap.account_status <> 'active'
    )
    -- Public, active channels only. Private channels require membership, and a
    -- guest cannot be a member of anything.
    AND EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_posts.channel_id
        AND c.is_public = true
        AND c.status = 'active'
    )
  );

COMMENT ON POLICY channel_posts_select_anon ON public.channel_posts IS
  'Guest browsing (v61). Approved posts in public active channels, premium included — the locked catalogue is the signup incentive. Scoped TO anon, so authenticated users still go through channel_posts_select_v57 and this cannot widen their access. Column-level GRANT withholds video_url, which is what actually stops a guest playing free content.';

-- ═══════════════════════════════════════════════════════════════
-- 2. channels — enough to render the browse UI
-- ═══════════════════════════════════════════════════════════════

REVOKE ALL ON public.channels FROM anon;

GRANT SELECT (
  id, owner_id, name, description, category, is_official,
  is_public, status, member_count, post_count, created_at
) ON public.channels TO anon;

-- Not granted: approval_expires_at and media_size (internal moderation and
-- accounting), and link.

CREATE POLICY channels_select_anon
  ON public.channels FOR SELECT
  TO anon
  USING (is_public = true AND status = 'active');

-- ═══════════════════════════════════════════════════════════════
-- 3. profiles — display identity ONLY
-- ═══════════════════════════════════════════════════════════════
--
-- The feed joins the author for a name and avatar. Guests get exactly those.
--
-- `email` is emphatically not granted. lib/posts.ts:252 selects
-- `owner:profiles!channels_owner_id_fkey(id, full_name, email)` on the channel
-- query — if anon could read `email`, that one existing query would enumerate
-- the email address of every channel owner in the app to anyone who installs it.
-- The column GRANT is what prevents it; the query itself is unchanged.

REVOKE ALL ON public.profiles FROM anon;

GRANT SELECT (id, full_name, avatar_url, username) ON public.profiles TO anon;

CREATE POLICY profiles_select_anon
  ON public.profiles FOR SELECT
  TO anon
  USING (
    account_status = 'active'
    -- Only people who have actually published something into a public channel.
    -- Without this, the whole user table is enumerable by display name.
    AND EXISTS (
      SELECT 1
      FROM public.channel_posts p
      JOIN public.channels c ON c.id = p.channel_id
      WHERE p.author_id = profiles.id
        AND p.status = 'approved'
        AND c.is_public = true
        AND c.status = 'active'
    )
  );

COMMENT ON POLICY profiles_select_anon ON public.profiles IS
  'Guest browsing (v61). Display identity for authors who have published to a public channel. Restricted to published authors so the user table is not enumerable, and the column GRANT withholds email — one existing channel query selects owner email and would otherwise leak it to every guest.';

-- ═══════════════════════════════════════════════════════════════
-- 4. What guests still cannot do
-- ═══════════════════════════════════════════════════════════════
--
-- Nothing below is granted to anon, and nothing here changes:
--   * play any video — video_url is not readable, and premium additionally
--     requires a signed token from stream-playback-token, which rejects an
--     unauthenticated caller with 401
--   * read private channels, or any channel that is not active
--   * see any post that is not 'approved' — drafts, pending, rejected, removed
--   * read watch_history, notifications, files, transfers, user_preferences,
--     content_access_grants, iap_purchases, admin_audit_log
--   * write anything at all — no INSERT, UPDATE or DELETE grant is issued
--
-- The age gate moves to first launch in the client, because a guest who has
-- not signed up has not passed the 18+ check at signup.

NOTIFY pgrst, 'reload schema';
