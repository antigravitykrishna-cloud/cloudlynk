-- ═══════════════════════════════════════════════════════════════════════════
-- v64 — Channels go live only when an admin approves them
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Three things, all about the same decision: a human reviews a channel before
-- it is visible to anyone.
--
--   1. activate_approved_channels() stops publishing on a timer.
--   2. 'rejected' becomes a legal status — the admin UI already writes it and
--      the CHECK constraint already rejects it, so the reject button throws.
--   3. admin_set_channel_status(), so approve/reject is one audited call
--      instead of a bare column UPDATE from the client.
--
-- Depends on v60 (is_active_admin, protect_channel_privileged_fields).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Preconditions ───────────────────────────────────────────────────────
-- v60 must be in place. Without is_active_admin() the function below would be
-- created but always deny, which is a far worse failure than not applying.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_active_admin'
  ) THEN
    RAISE EXCEPTION 'v64 requires v60: public.is_active_admin() is missing. Apply v60 first.';
  END IF;
END $$;

-- ── 1. 'rejected' is a real status ─────────────────────────────────────────
--
-- schema.sql declares:  check (status in ('pending', 'active', 'suspended'))
-- app/admin/pending-channels.tsx writes 'rejected' on the reject path.
--
-- So rejecting a channel raises 23514 and the admin sees "Reject failed" with
-- a Postgres constraint string. The only way to get rid of a bad channel today
-- is to suspend it, which is a different thing: suspended means "was live, has
-- been taken down", rejected means "was never approved".
--
-- The constraint name is not fixed across environments (schema.sql leaves it
-- to Postgres, and this database has drifted), so find it rather than guess.
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT con.conname INTO v_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'channels'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%'
    AND pg_get_constraintdef(con.oid) ILIKE '%pending%'
  LIMIT 1;

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.channels DROP CONSTRAINT %I', v_name);
    RAISE NOTICE 'v64: dropped channel status constraint %', v_name;
  ELSE
    RAISE NOTICE 'v64: no channel status CHECK found; adding one';
  END IF;
END $$;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_status_check
  CHECK (status IN ('pending', 'active', 'suspended', 'rejected'));

-- ── 2. No more publishing on a timer ───────────────────────────────────────
--
-- Was: any channel with approval_expires_at in the past flipped to 'active',
-- with no human involved. That is the opposite of the moderation posture this
-- app needs — it carries 18+ user-generated video, and "went live because a
-- timestamp elapsed" is exactly the answer that fails a Play UGC review.
--
-- The function is kept rather than dropped because a pg_cron job or an
-- external scheduler may still be calling it, and a missing function raises
-- 42883 on every run. A no-op that says so in the audit log is quieter and
-- self-documenting; delete it once you have confirmed nothing calls it.
CREATE OR REPLACE FUNCTION public.activate_approved_channels()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_waiting integer;
BEGIN
  -- Deliberately does not activate anything. Report the queue depth so a
  -- backlog is visible somewhere other than the admin screen.
  SELECT count(*) INTO v_waiting
  FROM public.channels
  WHERE status = 'pending';

  IF v_waiting > 0 THEN
    RAISE NOTICE 'v64: % channel(s) awaiting admin review; none auto-activated.', v_waiting;
  END IF;
END;
$fn$;

REVOKE ALL   ON FUNCTION public.activate_approved_channels() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_approved_channels() TO service_role;

COMMENT ON FUNCTION public.activate_approved_channels() IS
  'No-op since v64. Channels are published only by admin_set_channel_status(). Retained so any existing scheduled call does not error; safe to drop once nothing references it.';

-- Channels that were sitting in the auto-activation window keep waiting.
-- Clearing the timestamp makes the new rule true of existing rows too, rather
-- than leaving a column that no longer means anything.
UPDATE public.channels
   SET approval_expires_at = NULL
 WHERE status = 'pending'
   AND approval_expires_at IS NOT NULL;

-- ── 3. One audited entry point for approve / reject / suspend ──────────────
--
-- The admin screen currently PATCHes public.channels directly. That works —
-- v60's trigger lets an active admin through — but it leaves no audit row, so
-- there is no answer to "who approved this channel and when", which is the
-- first question asked when something objectionable is found live.
CREATE OR REPLACE FUNCTION public.admin_set_channel_status(
  p_channel_id uuid,
  p_status     text,
  p_reason     text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_old  text;
  v_name text;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('pending', 'active', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'Invalid channel status: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT status, name INTO v_old, v_name
  FROM public.channels WHERE id = p_channel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found' USING ERRCODE = 'P0002';
  END IF;

  -- Marks this write trusted for v60's trigger. is_active_admin() would also
  -- satisfy it, but setting the flag keeps the function correct if the admin
  -- check in that trigger is ever narrowed.
  PERFORM set_config('app.trusted_update', 'true', true);

  UPDATE public.channels
     SET status = p_status,
         approval_expires_at = NULL
   WHERE id = p_channel_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    'channel_status_changed',
    'channel',
    p_channel_id,
    jsonb_build_object(
      'channel_name', v_name,
      'from', v_old,
      'to', p_status,
      'reason', p_reason
    )
  );
END;
$fn$;

REVOKE ALL   ON FUNCTION public.admin_set_channel_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_channel_status(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_set_channel_status(uuid, text, text) IS
  'Sole supported way to publish, reject or suspend a channel. Admin-only, writes admin_audit_log. GRANTed to authenticated because the caller is a signed-in admin; the is_active_admin() check inside is what authorises, not the grant.';

COMMIT;
