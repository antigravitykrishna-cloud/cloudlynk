-- v59: admins can edit a post after publishing it.
--
-- ═══════════════════════════════════════════════════════════════
-- WHY THIS EXISTS
-- ═══════════════════════════════════════════════════════════════
--
-- Until now AdminContentService could change exactly two things about a post:
-- its status and its access level. There was no way to fix a typo in a title,
-- correct a genre, swap a bad thumbnail, or replace a video that encoded
-- badly. The only remedy was to remove the post and upload it again.
--
-- That remedy is worse than it looks. content_access_grants rows are keyed on
-- post_id. Re-uploading produces a NEW post_id, so every individual access
-- grant an admin had issued for that post silently stops applying — the
-- grantee keeps a row pointing at a post that no longer exists, sees nothing,
-- and nobody is told. Editing in place keeps the id, and therefore keeps the
-- grants.
--
-- Two functions, split on purpose:
--
--   admin_update_post          metadata and thumbnail. Pure database work.
--   admin_replace_post_video   the video UID. Must NOT be called directly —
--                              see the warning on it.

-- ═══════════════════════════════════════════════════════════════
-- 1. Metadata and thumbnail
-- ═══════════════════════════════════════════════════════════════
--
-- Every parameter is NULL-means-leave-alone, so a caller sends only what it is
-- changing and cannot blank a field by omitting it. The cost is that a field
-- genuinely cannot be set back to NULL through this function; p_clear_fields
-- handles that explicitly, so clearing is always deliberate.
--
-- access_level and status are NOT settable here. They already have their own
-- functions, and access_level in particular must go through stream-set-access
-- because it has to move Cloudflare's requireSignedURLs flag in step with the
-- database. A second path that changed it without the Cloudflare half would
-- reintroduce the leak v57 closed.

CREATE OR REPLACE FUNCTION public.admin_update_post(
  p_post_id        uuid,
  p_title          text     DEFAULT NULL,
  p_body           text     DEFAULT NULL,
  p_genre          text     DEFAULT NULL,
  p_duration_min   integer  DEFAULT NULL,
  p_release_year   integer  DEFAULT NULL,
  p_season_number  integer  DEFAULT NULL,
  p_episode_number integer  DEFAULT NULL,
  p_episode_title  text     DEFAULT NULL,
  p_thumbnail_url  text     DEFAULT NULL,
  p_clear_fields   text[]   DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_before jsonb;
  v_after  jsonb;
  v_field  text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(cp) INTO v_before FROM public.channel_posts cp WHERE cp.id = p_post_id;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Post % not found', p_post_id USING ERRCODE = 'P0002';
  END IF;

  IF p_title IS NOT NULL AND btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Title cannot be blank. Pass it in p_clear_fields to clear it.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.channel_posts
     SET title          = coalesce(p_title,          title),
         body           = coalesce(p_body,           body),
         genre          = coalesce(p_genre,          genre),
         duration_min   = coalesce(p_duration_min,   duration_min),
         release_year   = coalesce(p_release_year,   release_year),
         season_number  = coalesce(p_season_number,  season_number),
         episode_number = coalesce(p_episode_number, episode_number),
         episode_title  = coalesce(p_episode_title,  episode_title),
         thumbnail_url  = coalesce(p_thumbnail_url,  thumbnail_url)
   WHERE id = p_post_id;

  -- Explicit clears. Whitelisted rather than dynamic on the caller's string,
  -- so this cannot be steered at a column it should not touch.
  IF p_clear_fields IS NOT NULL THEN
    FOREACH v_field IN ARRAY p_clear_fields LOOP
      CASE v_field
        WHEN 'body'           THEN UPDATE public.channel_posts SET body = NULL WHERE id = p_post_id;
        WHEN 'genre'          THEN UPDATE public.channel_posts SET genre = NULL WHERE id = p_post_id;
        WHEN 'duration_min'   THEN UPDATE public.channel_posts SET duration_min = NULL WHERE id = p_post_id;
        WHEN 'release_year'   THEN UPDATE public.channel_posts SET release_year = NULL WHERE id = p_post_id;
        WHEN 'season_number'  THEN UPDATE public.channel_posts SET season_number = NULL WHERE id = p_post_id;
        WHEN 'episode_number' THEN UPDATE public.channel_posts SET episode_number = NULL WHERE id = p_post_id;
        WHEN 'episode_title'  THEN UPDATE public.channel_posts SET episode_title = NULL WHERE id = p_post_id;
        WHEN 'thumbnail_url'  THEN UPDATE public.channel_posts SET thumbnail_url = NULL WHERE id = p_post_id;
        ELSE RAISE EXCEPTION 'Field % cannot be cleared through this function', v_field USING ERRCODE = '22023';
      END CASE;
    END LOOP;
  END IF;

  SELECT to_jsonb(cp) INTO v_after FROM public.channel_posts cp WHERE cp.id = p_post_id;

  -- Log only what actually changed. A diff of two whole rows would bury the
  -- one edited field and copy the post body into the audit table on every save.
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(), 'post_updated', 'post', p_post_id,
    (SELECT coalesce(jsonb_object_agg(key, jsonb_build_object('from', v_before -> key, 'to', v_after -> key)), '{}'::jsonb)
       FROM jsonb_each(v_after)
      WHERE v_before -> key IS DISTINCT FROM v_after -> key)
  );
END;
$fn$;

REVOKE ALL   ON FUNCTION public.admin_update_post(uuid, text, text, text, integer, integer, integer, integer, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_post(uuid, text, text, text, integer, integer, integer, integer, text, text, text[]) TO authenticated;

COMMENT ON FUNCTION public.admin_update_post(uuid, text, text, text, integer, integer, integer, integer, text, text, text[]) IS
  'Edits a post in place, preserving its id and therefore its content_access_grants. NULL means leave alone; clearing a field requires naming it in p_clear_fields. Does NOT change access_level (use stream-set-access, which moves Cloudflare in step) or status (use admin_set_post_status).';

-- ═══════════════════════════════════════════════════════════════
-- 2. Replacing the video
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠ DO NOT CALL THIS DIRECTLY FROM A SCREEN. ⚠
--
-- Call the `admin-replace-video` edge function, which does the Cloudflare work
-- and then calls this. Postgres cannot reach Cloudflare, so this function
-- alone cannot enforce the part that matters.
--
-- What goes wrong if it is called directly on a premium post: the new video is
-- created unsigned (v57 made uploads lock by default, but a video that has
-- been through direct-upload and never been played can still be sitting
-- unlocked if it predates that change), and stream-playback-token only
-- asserts the lock lazily. Between the swap and the first play, a premium post
-- serves an unsigned URL — the exact hole v57 closed, reopened through a side
-- door.
--
-- The old UID is deliberately NOT deleted from Cloudflare here. Deleting is
-- irreversible and a swap is often a mistake being corrected; the old video is
-- recorded in the audit row so it can be restored or cleaned up deliberately.

CREATE OR REPLACE FUNCTION public.admin_replace_post_video(
  p_post_id uuid,
  p_new_uid text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_old_uid  text;
  v_author   uuid;
  v_access   text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_new_uid IS NULL OR btrim(p_new_uid) = '' THEN
    RAISE EXCEPTION 'p_new_uid is required' USING ERRCODE = '22023';
  END IF;

  SELECT video_url, author_id, access_level
    INTO v_old_uid, v_author, v_access
    FROM public.channel_posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post % not found', p_post_id USING ERRCODE = 'P0002';
  END IF;

  IF v_old_uid IS NOT DISTINCT FROM p_new_uid THEN
    RETURN; -- idempotent: a retried edge-function call is not an error
  END IF;

  UPDATE public.channel_posts SET video_url = p_new_uid WHERE id = p_post_id;

  -- Point stream_videos at the new UID so stream-playback-token's lock cache
  -- describes the video actually being served. Marked signed_locked = true
  -- for a premium post because the edge function locked it before calling
  -- here; if that ordering is ever broken, the lazy assert still repairs it.
  INSERT INTO public.stream_videos (user_id, stream_uid, context, post_id, signed_locked)
  VALUES (v_author, p_new_uid, 'post_video', p_post_id, v_access = 'premium')
  ON CONFLICT (user_id, stream_uid) DO UPDATE
    SET post_id = EXCLUDED.post_id,
        signed_locked = EXCLUDED.signed_locked;

  -- The old row keeps its own signed_locked state. It still describes a real
  -- Cloudflare video that still exists.
  UPDATE public.stream_videos SET post_id = NULL
   WHERE stream_uid = v_old_uid AND post_id = p_post_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'post_video_replaced', 'post', p_post_id,
          jsonb_build_object('from', v_old_uid, 'to', p_new_uid, 'access_level', v_access));
END;
$fn$;

REVOKE ALL   ON FUNCTION public.admin_replace_post_video(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_replace_post_video(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_replace_post_video(uuid, text) IS
  'Swaps a post video UID in place, preserving post_id and its grants. Call the admin-replace-video edge function rather than this — Postgres cannot set requireSignedURLs on Cloudflare, so calling this directly on a premium post can leave the new video served unsigned until its first play. Does not delete the old Cloudflare video; the UID is in the audit row.';

-- ═══════════════════════════════════════════════════════════════
-- 3. Audit action labels
-- ═══════════════════════════════════════════════════════════════
-- Two new action strings for app/admin/audit.tsx: 'post_updated' and
-- 'post_video_replaced'. AUDIT_ACTION_LABELS in lib/adminContent.ts needs both
-- or the audit screen shows the raw key.

NOTIFY pgrst, 'reload schema';
