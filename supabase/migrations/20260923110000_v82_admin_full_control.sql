-- v82: the admin panel can do everything.
--
-- The client runs Cloudlynk from the admin panel, and asked that an admin be
-- able to do anything from there. Until now several things could only be done
-- in the Supabase dashboard: give or take away Premium, make someone an admin,
-- suspend or ban an account, allow uploads, change plan prices, change a
-- channel's visibility, and message users.
--
-- Every function below:
--   * checks the caller is an active admin (is_active_admin(), v39);
--   * sets app.trusted_update so the profile guard trigger (v52) lets the
--     protected columns change;
--   * writes admin_audit_log, so every one of these powers leaves a record of
--     who used it and when (visible in Admin -> Audit log).
--
-- Two guard rails that stay: an admin cannot remove their own admin rights or
-- suspend/ban themselves. Both are the classic way to lock the last admin out
-- of the app, and neither is ever what someone meant to do.

-- ── Users ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'created_at', p.created_at,
    'is_admin', coalesce(p.is_admin, false),
    'can_upload_content', coalesce(p.can_upload_content, false),
    'account_status', p.account_status,
    'approval_status', p.approval_status,
    'plan_status', p.plan_status,
    'plan_started_at', p.plan_started_at,
    'plan_expires_at', p.plan_expires_at,
    'plan_active', public.is_plan_active(p.id),
    'channels_owned', (SELECT count(*) FROM public.channels c WHERE c.owner_id = p.id),
    'channels_joined', (SELECT count(*) FROM public.channel_members m WHERE m.user_id = p.id),
    'posts', (SELECT count(*) FROM public.channel_posts cp WHERE cp.author_id = p.id),
    'payments_paid', (SELECT count(*) FROM public.payment_orders o WHERE o.user_id = p.id AND o.status = 'paid'),
    'last_payment_at', (SELECT max(o.paid_at) FROM public.payment_orders o WHERE o.user_id = p.id)
  ) INTO r
  FROM public.profiles p WHERE p.id = p_user_id;

  IF r IS NULL THEN
    RAISE EXCEPTION 'No such user' USING ERRCODE = 'P0002';
  END IF;
  RETURN r;
END;
$$;

-- Premium by hand: add days, set an exact end date, make it lifetime, or take
-- it away. For refunds, gifts, support cases and anyone who paid outside the
-- app.
CREATE OR REPLACE FUNCTION public.admin_set_user_plan(
  p_user_id    uuid,
  p_action     text,               -- add_days | set_expiry | lifetime | revoke
  p_days       integer DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p          public.profiles%ROWTYPE;
  new_status text;
  new_expiry timestamptz;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such user' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'add_days' THEN
    IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
      RAISE EXCEPTION 'Days must be between 1 and 3650' USING ERRCODE = '22023';
    END IF;
    new_status := 'active';
    new_expiry := (CASE
      WHEN p.plan_status = 'active' AND p.plan_expires_at > now() THEN p.plan_expires_at
      ELSE now() END) + make_interval(days => p_days);
  ELSIF p_action = 'set_expiry' THEN
    IF p_expires_at IS NULL OR p_expires_at <= now() THEN
      RAISE EXCEPTION 'The end date must be in the future' USING ERRCODE = '22023';
    END IF;
    new_status := 'active';
    new_expiry := p_expires_at;
  ELSIF p_action = 'lifetime' THEN
    new_status := 'lifetime';
    new_expiry := NULL;
  ELSIF p_action = 'revoke' THEN
    new_status := 'free';
    new_expiry := NULL;
  ELSE
    RAISE EXCEPTION 'Unknown action %', p_action USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.trusted_update', 'true', true);
  UPDATE public.profiles
     SET plan_status     = new_status,
         plan_expires_at = new_expiry,
         plan_started_at = CASE
           WHEN new_status IN ('active', 'lifetime') AND plan_status NOT IN ('active', 'lifetime') THEN now()
           WHEN new_status = 'free' THEN NULL
           ELSE plan_started_at END
   WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'set_user_plan', 'user', p_user_id, jsonb_build_object(
    'action', p_action, 'days', p_days, 'from_status', p.plan_status, 'from_expiry', p.plan_expires_at,
    'to_status', new_status, 'to_expiry', new_expiry));

  RETURN jsonb_build_object('plan_status', new_status, 'plan_expires_at', new_expiry);
END;
$$;

-- Admin rights, upload rights and account status. Pass only what changes.
CREATE OR REPLACE FUNCTION public.admin_set_user_flags(
  p_user_id        uuid,
  p_is_admin       boolean DEFAULT NULL,
  p_can_upload     boolean DEFAULT NULL,
  p_account_status text    DEFAULT NULL,   -- active | suspended | banned
  p_reason         text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such user' USING ERRCODE = 'P0002';
  END IF;

  IF p_user_id = auth.uid() AND p_is_admin IS FALSE THEN
    RAISE EXCEPTION 'You cannot remove your own admin rights. Ask another admin.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() AND p_account_status IS NOT NULL AND p_account_status <> 'active' THEN
    RAISE EXCEPTION 'You cannot suspend or ban your own account.' USING ERRCODE = '42501';
  END IF;
  IF p_account_status IS NOT NULL AND p_account_status NOT IN ('active', 'suspended', 'banned') THEN
    RAISE EXCEPTION 'Unknown account status %', p_account_status USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.trusted_update', 'true', true);
  UPDATE public.profiles
     SET is_admin           = coalesce(p_is_admin, is_admin),
         can_upload_content = coalesce(p_can_upload, can_upload_content),
         account_status     = coalesce(p_account_status, account_status)
   WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'set_user_flags', 'user', p_user_id, jsonb_strip_nulls(jsonb_build_object(
    'is_admin', p_is_admin, 'can_upload', p_can_upload, 'account_status', p_account_status,
    'reason', nullif(trim(coalesce(p_reason, '')), ''),
    'was', jsonb_build_object('is_admin', p.is_admin, 'can_upload', p.can_upload_content, 'account_status', p.account_status))));
END;
$$;

-- ── Plans & prices ─────────────────────────────────────────────────────────
--
-- Changes what the app shows and what Razorpay / Sabpaisa charge (the
-- payments function reads the price from this table). Google Play prices are
-- set in Play Console and are NOT changed by this -- the admin screen says so.

CREATE OR REPLACE FUNCTION public.admin_update_plan(
  p_code          text,
  p_name          text,
  p_description   text,
  p_price_inr     integer,
  p_duration_days integer,
  p_is_popular    boolean,
  p_is_active     boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old public.subscription_plans%ROWTYPE;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Name is required' USING ERRCODE = '22023';
  END IF;
  IF p_price_inr IS NULL OR p_price_inr < 1 OR p_price_inr > 100000 THEN
    RAISE EXCEPTION 'Price must be between 1 and 100000' USING ERRCODE = '22023';
  END IF;
  IF p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 3650 THEN
    RAISE EXCEPTION 'Duration must be between 1 and 3650 days' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO old FROM public.subscription_plans WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No plan %', p_code USING ERRCODE = 'P0002';
  END IF;

  -- One "most popular" at a time: it is a single highlight, not a label.
  IF p_is_popular THEN
    UPDATE public.subscription_plans SET is_popular = false WHERE code <> p_code AND is_popular;
  END IF;

  UPDATE public.subscription_plans
     SET name = trim(p_name),
         description = coalesce(trim(p_description), ''),
         price_inr = p_price_inr,
         duration_days = p_duration_days,
         is_popular = coalesce(p_is_popular, false),
         is_active = coalesce(p_is_active, true),
         updated_at = now()
   WHERE code = p_code;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'update_plan', 'plan', old.id, jsonb_build_object(
    'code', p_code,
    'from', jsonb_build_object('name', old.name, 'price_inr', old.price_inr, 'duration_days', old.duration_days,
                               'is_popular', old.is_popular, 'is_active', old.is_active),
    'to',   jsonb_build_object('name', p_name, 'price_inr', p_price_inr, 'duration_days', p_duration_days,
                               'is_popular', p_is_popular, 'is_active', p_is_active)));
END;
$$;

-- Admins see every plan, including switched-off ones (the public read policy
-- only returns active plans).
CREATE OR REPLACE FUNCTION public.admin_list_plans()
RETURNS SETOF public.subscription_plans
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.subscription_plans ORDER BY sort_order, price_inr;
END;
$$;

-- ── Channels ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_update_channel(
  p_channel_id  uuid,
  p_name        text,
  p_description text,
  p_category    text,
  p_is_public   boolean,
  p_is_official boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old public.channels%ROWTYPE;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Channel name is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO old FROM public.channels WHERE id = p_channel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such channel' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.channels
     SET name = trim(p_name),
         description = nullif(trim(coalesce(p_description, '')), ''),
         category = nullif(trim(coalesce(p_category, '')), ''),
         is_public = coalesce(p_is_public, is_public),
         is_official = coalesce(p_is_official, is_official)
   WHERE id = p_channel_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'update_channel', 'channel', p_channel_id, jsonb_build_object(
    'from', jsonb_build_object('name', old.name, 'is_public', old.is_public, 'is_official', old.is_official, 'category', old.category),
    'to',   jsonb_build_object('name', p_name, 'is_public', p_is_public, 'is_official', p_is_official, 'category', p_category)));
END;
$$;

-- ── Announcements ──────────────────────────────────────────────────────────

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check_v75;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check_v82;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check_v82 CHECK (type = ANY (ARRAY[
  'channel_approved', 'channel_rejected', 'post_approved', 'post_rejected',
  'subscription_expiring', 'subscription_expired', 'announcement'
]));

-- Sends an in-app notification to everyone, to paying members, or to free
-- accounts. Returns how many people it reached.
CREATE OR REPLACE FUNCTION public.admin_broadcast(
  p_title    text,
  p_body     text,
  p_audience text DEFAULT 'all'   -- all | premium | free
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_title), '') = '' OR coalesce(trim(p_body), '') = '' THEN
    RAISE EXCEPTION 'Title and message are both required' USING ERRCODE = '22023';
  END IF;
  IF length(p_title) > 120 OR length(p_body) > 1000 THEN
    RAISE EXCEPTION 'Title is limited to 120 characters and the message to 1000' USING ERRCODE = '22023';
  END IF;
  IF p_audience NOT IN ('all', 'premium', 'free') THEN
    RAISE EXCEPTION 'Unknown audience %', p_audience USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body)
  SELECT p.id, 'announcement', trim(p_title), trim(p_body)
    FROM public.profiles p
   WHERE p.account_status = 'active'
     AND (p_audience = 'all'
          OR (p_audience = 'premium' AND public.is_plan_active(p.id))
          OR (p_audience = 'free' AND NOT public.is_plan_active(p.id)));
  GET DIAGNOSTICS n = ROW_COUNT;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'broadcast', 'notification', NULL,
          jsonb_build_object('title', p_title, 'audience', p_audience, 'recipients', n));
  RETURN n;
END;
$$;

-- ── Grants ─────────────────────────────────────────────────────────────────
-- EXECUTE to authenticated is not an access grant: every function checks
-- is_active_admin() itself (the pattern admin_search_users set in v56).

REVOKE ALL ON FUNCTION public.admin_get_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_plan(uuid, text, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_flags(uuid, boolean, boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_plan(text, text, text, integer, integer, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_plans() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_channel(uuid, text, text, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_broadcast(text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_plan(uuid, text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_flags(uuid, boolean, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_plan(text, text, text, integer, integer, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_channel(uuid, text, text, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_broadcast(text, text, text) TO authenticated;
