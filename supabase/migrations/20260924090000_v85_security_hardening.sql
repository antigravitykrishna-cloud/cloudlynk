-- v85: security audit fixes (2026-09-24).
--
-- 1. Channel membership could be inserted directly. Two leftover INSERT
--    policies on channel_members let any signed-in user add themselves to ANY
--    channel -- hidden ones included, and with any role -- skipping
--    join_channel's rules. Membership is the visibility grant for a hidden
--    channel, and role 'owner'/'admin' feeds can_post_to_channel. Now the
--    only direct insert allowed is a channel's owner adding themselves to
--    their own channel (what ChannelService.createChannel does); everyone
--    else joins through join_channel().
--
-- 2. Public channel-media bucket accepted uploads anywhere from anyone
--    signed in ("Authenticated users can upload channel media" had no folder
--    check), i.e. free public file hosting on our bill. The own-folder policy
--    that the app actually satisfies stays.
--
-- 3. Storage quota could be bypassed three ways: storage_used was
--    self-editable on profiles, decrement_storage_used let a user subtract
--    any amount from their own counter, and file sizes were whatever the app
--    claimed. Now the database counts the real object sizes itself (trigger
--    on storage.objects, user-files bucket), rejects an upload that would go
--    past the limit, and the two RPCs only re-sync the counter from those
--    real sizes. storage_used is guarded against self-edits.
--
-- 4. Counters: member_count / post_count / media_size were writable by a
--    channel's owner (vanity + ranking manipulation), increment_channel_members
--    let anyone bump any channel, and post_count only ever went up (never
--    down on unpublish/delete -- 55 counted vs 48 real). Now both counts are
--    maintained by triggers, guarded, and recomputed from the truth.
--
-- 5. View counts could be inflated without limit by calling record_post_view
--    in a loop (anon included). Now one view per signed-in account per post
--    per day.
--
-- 6. Payment orders: at most 10 new orders per account per 10 minutes, so
--    the payments function cannot be used to spam gateway orders.
--
-- 7. creator_status and role on profiles are no longer self-editable.

-- ── 1. channel_members ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can join channels" ON public.channel_members;
DROP POLICY IF EXISTS "Paid and pending users can join channels" ON public.channel_members;
DROP POLICY IF EXISTS "Owners see own channel memberships" ON public.channel_members; -- duplicate of "Members can view memberships"

DROP POLICY IF EXISTS channel_members_owner_self_insert ON public.channel_members;
CREATE POLICY channel_members_owner_self_insert ON public.channel_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_id AND c.owner_id = (SELECT auth.uid()))
  );

-- ── 2. channel-media uploads ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can upload channel media" ON storage.objects;

-- ── 3. storage quota ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_files_owner(p_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN (string_to_array(p_name, '/'))[1]::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.track_user_file_storage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user  uuid;
  v_delta bigint := 0;
  v_used  bigint;
  v_limit bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.bucket_id <> 'user-files' THEN RETURN OLD; END IF;
    v_user := public.user_files_owner(OLD.name);
    v_delta := -coalesce((OLD.metadata->>'size')::bigint, 0);
  ELSE
    IF NEW.bucket_id <> 'user-files' THEN RETURN NEW; END IF;
    v_user := public.user_files_owner(NEW.name);
    v_delta := coalesce((NEW.metadata->>'size')::bigint, 0);
    IF TG_OP = 'UPDATE' AND OLD.bucket_id = 'user-files' THEN
      v_delta := v_delta - coalesce((OLD.metadata->>'size')::bigint, 0);
    END IF;
  END IF;

  IF v_user IS NULL OR v_delta = 0 THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT storage_used, storage_limit INTO v_used, v_limit
    FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF v_delta > 0 AND v_used + v_delta > v_limit THEN
    RAISE EXCEPTION 'Storage quota exceeded' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.trusted_update', 'true', true);
  UPDATE public.profiles SET storage_used = greatest(0, storage_used + v_delta) WHERE id = v_user;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS cloudlynk_track_user_files_ins ON storage.objects;
DROP TRIGGER IF EXISTS cloudlynk_track_user_files_del ON storage.objects;
CREATE TRIGGER cloudlynk_track_user_files_ins
  BEFORE INSERT OR UPDATE OF metadata, bucket_id, name ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.track_user_file_storage();
CREATE TRIGGER cloudlynk_track_user_files_del
  AFTER DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.track_user_file_storage();

-- The truth, for re-syncing.
CREATE OR REPLACE FUNCTION public.user_files_bytes(p_user uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum((metadata->>'size')::bigint), 0)
    FROM storage.objects
   WHERE bucket_id = 'user-files' AND public.user_files_owner(name) = p_user;
$$;
REVOKE ALL ON FUNCTION public.user_files_bytes(uuid) FROM PUBLIC, anon, authenticated;

-- Old app builds still call these after each upload / delete. They no longer
-- trust p_bytes: they re-sync the counter from the real sizes. The quota is
-- enforced by the trigger above.
CREATE OR REPLACE FUNCTION public.increment_storage_used(p_user_id uuid, p_bytes bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Cannot modify storage counter for another user' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.trusted_update', 'true', true);
  UPDATE public.profiles SET storage_used = public.user_files_bytes(p_user_id) WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_storage_used(p_user_id uuid, p_bytes bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Cannot modify storage counter for another user' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.trusted_update', 'true', true);
  UPDATE public.profiles SET storage_used = public.user_files_bytes(p_user_id) WHERE id = p_user_id;
END;
$$;

-- ── 4. channel counters ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_channel_member_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.trusted_update', 'true', true);
  IF TG_OP = 'INSERT' THEN
    UPDATE public.channels SET member_count = member_count + 1 WHERE id = NEW.channel_id;
    RETURN NEW;
  END IF;
  UPDATE public.channels SET member_count = greatest(0, member_count - 1) WHERE id = OLD.channel_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cloudlynk_channel_member_count ON public.channel_members;
CREATE TRIGGER cloudlynk_channel_member_count
  AFTER INSERT OR DELETE ON public.channel_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_channel_member_count();

-- leave_channel used to decrement by hand; the trigger does it now.
CREATE OR REPLACE FUNCTION public.leave_channel(p_channel_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.channel_members WHERE channel_id = p_channel_id AND user_id = v_caller;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_channel_post_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  was_counted boolean := false;
  is_counted  boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN was_counted := OLD.status = 'approved'; END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN is_counted := NEW.status = 'approved'; END IF;

  PERFORM set_config('app.trusted_update', 'true', true);
  IF TG_OP = 'UPDATE' AND OLD.channel_id IS DISTINCT FROM NEW.channel_id THEN
    IF was_counted THEN UPDATE public.channels SET post_count = greatest(0, post_count - 1) WHERE id = OLD.channel_id; END IF;
    IF is_counted  THEN UPDATE public.channels SET post_count = post_count + 1 WHERE id = NEW.channel_id; END IF;
  ELSIF is_counted AND NOT was_counted THEN
    UPDATE public.channels SET post_count = post_count + 1 WHERE id = NEW.channel_id;
  ELSIF was_counted AND NOT is_counted THEN
    UPDATE public.channels SET post_count = greatest(0, post_count - 1) WHERE id = OLD.channel_id;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS channel_post_approved ON public.channel_posts;
CREATE TRIGGER channel_post_approved
  AFTER INSERT OR UPDATE OF status, channel_id OR DELETE ON public.channel_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_channel_post_count();

-- Counters are no longer editable by a channel's owner.
CREATE OR REPLACE FUNCTION public.protect_channel_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_trusted boolean;
  jwt_role   text;
BEGIN
  BEGIN
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role';
  EXCEPTION WHEN others THEN
    jwt_role := NULL;
  END;

  is_trusted := (
    coalesce(current_setting('app.trusted_update', true), '') = 'true'
    OR coalesce(jwt_role, '') = 'service_role'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR public.is_active_admin()
  );

  IF NOT is_trusted THEN
    NEW.status := OLD.status;
    NEW.approval_expires_at := OLD.approval_expires_at;
    NEW.owner_id := OLD.owner_id;
    -- v85: now governed. Every writer of these (the member/post triggers)
    -- marks itself trusted, so the reason v60 left them open is gone.
    NEW.member_count := OLD.member_count;
    NEW.post_count := OLD.post_count;
    NEW.media_size := OLD.media_size;
    NEW.is_official := OLD.is_official;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_channel_members(uuid) FROM PUBLIC, anon, authenticated;

-- ── 5. view counts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.post_view_log (
  post_id  uuid NOT NULL,
  user_id  uuid NOT NULL,
  day      date NOT NULL DEFAULT current_date,
  PRIMARY KEY (post_id, user_id, day)
);
ALTER TABLE public.post_view_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_view_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_post_view(p_post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF p_post_id IS NULL OR v_uid IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.post_view_log (post_id, user_id) VALUES (p_post_id, v_uid)
  ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE public.channel_posts SET view_count = view_count + 1
     WHERE id = p_post_id AND status = 'approved';
  END IF;
END;
$$;

-- Only today's rows matter for de-duplication; keep the table small.
DO $$
BEGIN
  PERFORM cron.unschedule('cloudlynk-prune-view-log')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cloudlynk-prune-view-log');
  PERFORM cron.schedule('cloudlynk-prune-view-log', '17 3 * * *',
    $c$DELETE FROM public.post_view_log WHERE day < current_date - 1$c$);
END $$;

-- ── 6. payment order rate limit ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.limit_payment_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND (
    SELECT count(*) FROM public.payment_orders
     WHERE user_id = NEW.user_id AND created_at > now() - interval '10 minutes'
  ) >= 10 THEN
    RAISE EXCEPTION 'Too many payment attempts. Please wait a few minutes.' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cloudlynk_limit_payment_orders ON public.payment_orders;
CREATE TRIGGER cloudlynk_limit_payment_orders
  BEFORE INSERT ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.limit_payment_orders();

-- ── 7 + 3. profile guard: storage_used, creator_status, role ───────────────

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_trusted boolean;
  jwt_role   text;
BEGIN
  BEGIN
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role';
  EXCEPTION WHEN others THEN
    jwt_role := NULL;
  END;

  is_trusted := (
    coalesce(current_setting('app.trusted_update', true), '') = 'true'
    OR coalesce(jwt_role, '') = 'service_role'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

  IF NOT is_trusted THEN
    NEW.is_admin := OLD.is_admin;
    NEW.can_upload_content := OLD.can_upload_content;
    NEW.plan_status := OLD.plan_status;
    NEW.plan_started_at := OLD.plan_started_at;
    NEW.plan_expires_at := OLD.plan_expires_at;
    NEW.account_status := OLD.account_status;
    NEW.terms_accepted_at := OLD.terms_accepted_at;
    NEW.terms_version := OLD.terms_version;
    NEW.community_guidelines_version := OLD.community_guidelines_version;
    NEW.privacy_version := OLD.privacy_version;
    NEW.birth_year := OLD.birth_year;
    NEW.plan := OLD.plan;
    NEW.approval_status := OLD.approval_status;
    NEW.approval_reviewed_by := OLD.approval_reviewed_by;
    NEW.approval_reviewed_at := OLD.approval_reviewed_at;
    NEW.approval_note := OLD.approval_note;
    -- v85
    NEW.storage_used := OLD.storage_used;
    NEW.creator_status := OLD.creator_status;
    NEW.role := OLD.role;
  END IF;

  NEW.storage_limit := 16106127360;
  RETURN NEW;
END;
$$;

-- ── Re-sync every counter from the truth ───────────────────────────────────

DO $$
BEGIN
  PERFORM set_config('app.trusted_update', 'true', true);
  UPDATE public.channels c SET
    member_count = (SELECT count(*) FROM public.channel_members m WHERE m.channel_id = c.id),
    post_count   = (SELECT count(*) FROM public.channel_posts p WHERE p.channel_id = c.id AND p.status = 'approved');
  UPDATE public.profiles p SET storage_used = public.user_files_bytes(p.id);
END $$;

-- ── 8. Guards on INSERT, not only UPDATE ───────────────────────────────────
--
-- The field guards above ran BEFORE UPDATE only, so the same fields could be
-- set freely when a row was created: a channel inserted already 'active'
-- (skipping admin approval), official, or with a made-up member count; a
-- post or channel video inserted already 'approved' (skipping moderation) --
-- and with joining public channels now open, that was anyone. New rows from
-- non-trusted writers now always start where the app starts them.

CREATE OR REPLACE FUNCTION public.cloudlynk_is_trusted_writer()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE jwt_role text;
BEGIN
  BEGIN
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role';
  EXCEPTION WHEN others THEN
    jwt_role := NULL;
  END;
  RETURN coalesce(current_setting('app.trusted_update', true), '') = 'true'
      OR coalesce(jwt_role, '') = 'service_role'
      OR public.is_active_admin();
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_new_channel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.cloudlynk_is_trusted_writer() THEN
    NEW.status := 'pending';
    NEW.is_official := false;
    NEW.member_count := 0;
    NEW.post_count := 0;
    NEW.media_size := 0;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cloudlynk_guard_new_channel ON public.channels;
CREATE TRIGGER cloudlynk_guard_new_channel BEFORE INSERT ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_channel();

CREATE OR REPLACE FUNCTION public.guard_new_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.cloudlynk_is_trusted_writer() THEN
    IF NEW.status IS DISTINCT FROM 'draft' THEN NEW.status := 'pending'; END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.view_count := 0;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cloudlynk_guard_new_post ON public.channel_posts;
CREATE TRIGGER cloudlynk_guard_new_post BEFORE INSERT ON public.channel_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_post();

-- Posting needs the right to post there (can_post_to_channel: admin, an
-- account allowed to upload, the channel owner or a moderator), not just
-- membership -- membership of a public channel is now open to everyone.
DROP POLICY IF EXISTS "Eligible members can post" ON public.channel_posts;
CREATE POLICY "Eligible members can post" ON public.channel_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND public.can_create_ugc((SELECT auth.uid()))
    AND public.can_post_to_channel(channel_id)
  );

CREATE OR REPLACE FUNCTION public.guard_new_pending_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.cloudlynk_is_trusted_writer() THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cloudlynk_guard_new_channel_video ON public.channel_videos;
CREATE TRIGGER cloudlynk_guard_new_channel_video BEFORE INSERT ON public.channel_videos
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_pending_row();

CREATE OR REPLACE FUNCTION public.guard_new_series()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.cloudlynk_is_trusted_writer() THEN
    NEW.status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cloudlynk_guard_new_series ON public.series;
CREATE TRIGGER cloudlynk_guard_new_series BEFORE INSERT ON public.series
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_series();

-- Profiles are created only by handle_new_user (on_auth_user_created, runs as
-- the owner). A client-side insert policy only ever offered a way to create a
-- profile row with privileged fields already set.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
