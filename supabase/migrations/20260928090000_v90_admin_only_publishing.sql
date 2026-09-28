-- v90: the client's rules (2026-09-28).
--   1. A guest cannot join a channel.
--   2. A guest sees previews only (titles, thumbnails) -- nothing plays.
--   3. No user publishes content. Only admins create channels and post.
--   4. What a user uploads is visible to that user only (their Cloud).
--
-- Every channel/post/file row is created by a direct INSERT under RLS (no
-- SECURITY DEFINER function inserts them), so RESTRICTIVE policies here are
-- the whole enforcement: they AND with every permissive policy, and no
-- existing or future permissive policy can widen them.

-- 1. Guests cannot join.
CREATE OR REPLACE FUNCTION public.join_channel(p_channel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller          uuid := auth.uid();
  v_plan_status     text;
  v_account_status  text;
  v_is_guest        boolean;
  v_channel_status  text;
  v_channel_public  boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.is_active_admin() THEN
    INSERT INTO public.channel_members (channel_id, user_id)
    VALUES (p_channel_id, v_caller)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
    RETURN;
  END IF;

  SELECT plan_status, account_status, is_guest INTO v_plan_status, v_account_status, v_is_guest
    FROM public.profiles WHERE id = v_caller;
  IF v_account_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Account is not active' USING ERRCODE = '42501';
  END IF;
  IF coalesce(v_is_guest, false) THEN
    RAISE EXCEPTION 'Save your account to join channels.' USING ERRCODE = '42501';
  END IF;

  SELECT status, is_public INTO v_channel_status, v_channel_public
    FROM public.channels WHERE id = p_channel_id;
  IF v_channel_status IS NULL THEN
    RAISE EXCEPTION 'Channel % not found', p_channel_id USING ERRCODE = 'P0002';
  END IF;
  IF v_channel_status <> 'active' THEN
    RAISE EXCEPTION 'Channel is not active (status=%)', v_channel_status
      USING ERRCODE = '42501';
  END IF;

  IF NOT coalesce(v_channel_public, false)
     AND NOT public.is_plan_active(v_caller)
     AND coalesce(v_plan_status, '') <> 'pending' THEN
    RAISE EXCEPTION 'Subscription required to join this channel'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.channel_members (channel_id, user_id)
  VALUES (p_channel_id, v_caller)
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END;
$function$;

DROP POLICY IF EXISTS guests_no_join ON public.channel_members;
CREATE POLICY guests_no_join ON public.channel_members
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT public.is_guest()));

-- 2. Previews only for guests. free_post_media (v63) let a signed-out
--    visitor play FREE titles; that is exactly what the client no longer
--    wants. Its only caller was the guest branch of Explore. Playback for a
--    guest account is refused in stream-playback-token.
REVOKE SELECT ON public.free_post_media FROM anon, authenticated;

-- 3. Only admins publish.
CREATE OR REPLACE FUNCTION public.can_post_to_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_active_admin();
$function$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['channels', 'channel_posts', 'channel_videos', 'series', 'subtitles']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS admins_only_publish ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY admins_only_publish ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK ((SELECT public.is_active_admin()))', t);
  END LOOP;
END $$;

-- Channel video files are published content too.
DROP POLICY IF EXISTS admins_only_channel_videos ON storage.objects;
CREATE POLICY admins_only_channel_videos ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'channel-videos' OR (SELECT public.is_active_admin()));

-- 4. A user's own files stay private: never public, never on a channel.
DROP POLICY IF EXISTS files_private_insert ON public.files;
CREATE POLICY files_private_insert ON public.files
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_active_admin()) OR (NOT coalesce(is_public, false) AND channel_id IS NULL));
DROP POLICY IF EXISTS files_private_update ON public.files;
CREATE POLICY files_private_update ON public.files
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK ((SELECT public.is_active_admin()) OR (NOT coalesce(is_public, false) AND channel_id IS NULL));
