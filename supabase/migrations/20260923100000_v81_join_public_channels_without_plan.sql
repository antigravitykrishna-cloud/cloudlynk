-- v81: a signed-in account can join PUBLIC channels without a plan.
--
-- The client's flow: sign in, join the channels you like, see their posts in
-- your Feed, and be asked to subscribe at the moment you try to watch. Until
-- now join_channel refused anyone without an active plan, so the Feed of a
-- new account could never fill.
--
-- Why this is safe: membership does not unlock content. channel_posts_select
-- (v57) only returns premium rows to is_plan_active() or an explicit grant,
-- and stream-playback-token checks the plan again before minting a playback
-- token. A member without a plan sees exactly what they could already see in
-- a public channel.
--
-- What still needs a plan: joining a NON-public ("hidden") channel. Those
-- channels are where premium content lives, and for them membership is the
-- visibility grant -- channel_posts_select lets members read the free rows of
-- a channel that is not public. Letting anyone join would publish them.

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
  v_channel_status  text;
  v_channel_public  boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Admins moderate every channel, so they must be able to enter every
  -- channel, including suspended or pending ones they are reviewing.
  IF public.is_active_admin() THEN
    INSERT INTO public.channel_members (channel_id, user_id)
    VALUES (p_channel_id, v_caller)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
    RETURN;
  END IF;

  SELECT plan_status, account_status INTO v_plan_status, v_account_status
    FROM public.profiles WHERE id = v_caller;
  IF v_account_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Account is not active' USING ERRCODE = '42501';
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
