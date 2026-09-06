-- v60: three authorization gaps found auditing the admin surface.
--
--   1. Suspending an admin did not remove their admin powers.
--   2. activate_approved_channels() was callable by every signed-in user.
--   3. A channel owner may be able to approve their own channel by writing
--      to the row directly, bypassing the review queue.
--
-- (3) is conditional and deliberately cautious — see section 3.
--
-- A note on how section 1 is written, because it matters: the two function
-- bodies below are the v56 originals COPIED VERBATIM, with exactly one line
-- changed in each — the guard. A first draft of this migration rewrote them
-- from memory and, in doing so, dropped the user-exists and post-exists
-- validation, dropped the DEFAULT NULL on two parameters, dropped the
-- NOT FOUND check on revoke, and referenced revoked_at / revoked_by columns
-- that do not exist on content_access_grants — which would have failed to
-- apply. When replacing a live function, copy it and change the one line.

-- ═══════════════════════════════════════════════════════════════
-- 1. An admin's own account standing
-- ═══════════════════════════════════════════════════════════════
--
-- Every admin RPC guards itself with, in effect:
--
--   EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
--
-- None of them look at account_status. So suspending or banning an admin
-- removed their ability to *view* content (v57 gated the feed on the viewer's
-- standing) while leaving every destructive admin power intact: they could
-- still publish, unpublish, grant premium access, revoke it, approve users and
-- resolve reports. Suspension has to mean something for the person you are
-- most worried about, or it means nothing.
--
-- is_active_admin() becomes the single definition, in the same spirit as
-- has_content_access — one place to change, no chance of the checks drifting
-- apart across twenty-odd functions.

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = true
      AND account_status = 'active'
  );
$fn$;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;

COMMENT ON FUNCTION public.is_active_admin() IS
  'The single definition of "may perform an admin action": is_admin AND account_status = active. Prefer this over an inline EXISTS so a suspended admin cannot keep their powers in whichever function was forgotten.';

-- Converted here: the two functions that move content access. A suspended
-- admin retaining these is the worst case — silently granting premium to
-- accomplices, or revoking it from paying customers. The rest are listed as
-- follow-up at the bottom.

CREATE OR REPLACE FUNCTION public.admin_grant_content_access(
  p_user_id uuid,
  p_post_id uuid,
  p_expires_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- v60: was `is_admin = true` inline; now also requires account_status = 'active'.
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = p_user_id) THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.channel_posts WHERE channel_posts.id = p_post_id) THEN
    RAISE EXCEPTION 'Post % not found', p_post_id;
  END IF;

  -- Upsert on the (user_id, post_id) unique key: re-granting something that
  -- was previously revoked reactivates that row rather than erroring, and
  -- keeps the original created_at so the history stays readable.
  INSERT INTO public.content_access_grants (user_id, post_id, granted_by, reason, expires_at, status)
  VALUES (p_user_id, p_post_id, auth.uid(), p_reason, p_expires_at, 'active')
  ON CONFLICT (user_id, post_id) DO UPDATE
    SET status = 'active',
        granted_by = auth.uid(),
        reason = EXCLUDED.reason,
        starts_at = now(),
        expires_at = EXCLUDED.expires_at;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'access_granted', 'post', p_post_id,
          jsonb_build_object('user_id', p_user_id, 'expires_at', p_expires_at, 'reason', p_reason));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_revoke_content_access(
  p_user_id uuid,
  p_post_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- v60: was `is_admin = true` inline; now also requires account_status = 'active'.
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  -- Flip the status, never DELETE — the history is the point of the table.
  -- plan_status is deliberately untouched: revoking a grant must not disturb
  -- a subscription the user has actually paid for.
  UPDATE public.content_access_grants
  SET status = 'revoked'
  WHERE user_id = p_user_id AND post_id = p_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No grant found for that user and post';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'access_revoked', 'post', p_post_id,
          jsonb_build_object('user_id', p_user_id));
END;
$fn$;

-- ═══════════════════════════════════════════════════════════════
-- 2. activate_approved_channels()
-- ═══════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER, no admin check of any kind, and
-- `GRANT EXECUTE ... TO authenticated` (v40). Any signed-in user could run it.
--
-- The blast radius is bounded — it only activates channels already past
-- approval_expires_at, which were going to be activated anyway. What it gave
-- an attacker was an unrate-limited batch UPDATE over the channels table,
-- callable at will from any account, with no audit row. And it depended
-- entirely on approval_expires_at being right: one channel with a mistakenly
-- past timestamp becomes activatable by anyone, immediately.
--
-- Nothing in app/, lib/, hooks/ or any edge function calls it — verified
-- before writing this. It is a sweeper that belongs on a schedule, so the
-- grant moves to service_role and it now records what it did.
--
-- Worth stating separately, because it is a product question rather than a
-- security one: this design means channels go live on a timer with no human
-- ever looking at them. For a platform carrying 18+ UGC that is the moderation
-- posture Play scrutinises hardest.

CREATE OR REPLACE FUNCTION public.activate_approved_channels()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_ids uuid[];
BEGIN
  -- A CTE, not `UPDATE ... RETURNING id INTO v_ids`: plpgsql's RETURNING INTO
  -- takes a single row and would silently keep only the last channel touched.
  WITH activated AS (
    UPDATE public.channels
       SET status = 'active'
     WHERE status = 'pending'
       AND approval_expires_at IS NOT NULL
       AND approval_expires_at <= now()
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM activated;

  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    -- admin_id is NOT NULL and references profiles, and a cron run has no
    -- auth.uid(). Attribute it to the first admin rather than inventing a
    -- synthetic uuid that would violate the foreign key.
    INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
    SELECT
      coalesce(
        auth.uid(),
        (SELECT id FROM public.profiles WHERE is_admin = true ORDER BY created_at LIMIT 1)
      ),
      'channels_auto_activated', 'channel', NULL,
      jsonb_build_object('channel_ids', to_jsonb(v_ids), 'count', array_length(v_ids, 1))
    WHERE EXISTS (SELECT 1 FROM public.profiles WHERE is_admin = true);
  END IF;
END;
$fn$;

REVOKE ALL   ON FUNCTION public.activate_approved_channels() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_approved_channels() TO service_role;

COMMENT ON FUNCTION public.activate_approved_channels() IS
  'Scheduled sweeper. service_role only since v60 — it was GRANTed to authenticated, letting any signed-in user run an unrate-limited batch UPDATE on channels with no audit trail. Drive it from pg_cron.';

-- ═══════════════════════════════════════════════════════════════
-- 3. Channel status cannot be self-approved
-- ═══════════════════════════════════════════════════════════════
--
-- schema.sql creates:
--
--   create policy "Owners can update their channels"
--     on public.channels for update using (auth.uid() = owner_id);
--
-- No WITH CHECK, no column restriction, and nothing in the repository ever
-- drops it. If it is live, a channel owner can UPDATE their own row directly
-- over PostgREST and set status from 'pending' to 'active' — walking straight
-- past the admin review queue. migration_v39 added update_channel() described
-- in its own comment as "replaces raw UPDATE from client" but never dropped
-- the policy it was written to replace, and lib/posts.ts:412 still does raw
-- channel updates, which only work if such a policy exists.
--
-- I could not verify the live policy set without database access. So this is
-- fixed with a TRIGGER rather than by rewriting policies, for three reasons:
--
--   * It works whatever the policy set turns out to be. Touching policies
--     blind risks WIDENING access on a database already tighter than this
--     migration assumes — worse than leaving a suspected hole one more day.
--   * RLS WITH CHECK only sees the NEW row. Expressing "this column may not
--     change" there needs a subselect back into the table to recover the old
--     value, which is fragile. A trigger gets OLD and NEW directly.
--   * It is the pattern this schema already uses and has proven:
--     protect_profile_privileged_fields does exactly this for profiles.
--
-- Trusted writers are the same three as the profiles trigger, so the
-- update_channel() and approve/reject RPCs keep working unchanged — they are
-- SECURITY DEFINER and set app.trusted_update, or run as an admin.

CREATE OR REPLACE FUNCTION public.protect_channel_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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
    -- Approval state. The whole point: an owner may not publish their own
    -- channel — only an admin, or the scheduled sweeper, may.
    NEW.status := OLD.status;
    NEW.approval_expires_at := OLD.approval_expires_at;
    -- Ownership. Handing a channel to another account should not be a silent
    -- column write.
    NEW.owner_id := OLD.owner_id;
  END IF;

  -- DELIBERATELY NOT GOVERNED: member_count, post_count, media_size.
  --
  -- They are denormalised counters maintained by four SECURITY DEFINER
  -- functions — join_channel and leave_channel (v28), increment_channel_members
  -- (v40), and the update_channel_post_count trigger — none of which set
  -- app.trusted_update. Governing the counters here would revert all four for
  -- any non-admin caller, so member counts would silently stop moving on join
  -- and leave, and post counts on approval. Two data-integrity regressions
  -- introduced by a security fix.
  --
  -- The alternative was rewriting those four functions to mark themselves
  -- trusted, which is four more chances to drift from a live definition — the
  -- exact mistake the header of this migration describes. Not worth it for
  -- these columns: a faked member_count is a vanity and ranking problem, not
  -- an access-control one, and nothing gates entitlement on it. status,
  -- approval_expires_at and owner_id are the ones that decide who sees what,
  -- and those are covered.
  --
  -- If counter integrity is wanted later, do it as its own migration: mark
  -- each of the four trusted, one at a time, copying each live body verbatim.

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS channels_guard_privileged_fields ON public.channels;
CREATE TRIGGER channels_guard_privileged_fields
  BEFORE UPDATE ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.protect_channel_privileged_fields();

COMMENT ON FUNCTION public.protect_channel_privileged_fields() IS
  'Reverts channel status, approval_expires_at and owner_id for any writer that is not an active admin, service_role, or a SECURITY DEFINER function that set app.trusted_update. Closes the self-approval path left open by schema.sql''s unrestricted "Owners can update their channels" policy, without needing to know which policies are live. Deliberately does NOT govern the denormalised counters — see the comment in the body.';

-- Checked against every function that writes public.channels:
--
--   update_channel (v39)          name, description, updated_at   — ungoverned
--   join_channel / leave_channel  member_count                    — ungoverned
--   increment_channel_members     member_count                    — ungoverned
--   update_channel_post_count     post_count                      — ungoverned
--   admin_resolve_report (v48)    status  — but runs as an admin, so trusted
--   activate_approved_channels    status  — service_role since section 2, trusted
--
-- Nothing legitimate writes status, approval_expires_at or owner_id as an
-- untrusted caller, so this trigger reverts nothing that should happen.

-- ═══════════════════════════════════════════════════════════════
-- FOLLOW-UP — not done here, on purpose
-- ═══════════════════════════════════════════════════════════════
--
-- These still use the inline is_admin EXISTS and so remain callable by a
-- suspended admin. They read, or they moderate; none of them move entitlement,
-- which is why they are not in this migration. Each one must be converted the
-- way the two above were — copy the live body, change only the guard line:
--
--   admin_search_users              admin_get_profiles_by_ids
--   admin_get_post_grantees         admin_get_user_grants
--   admin_list_audit_log            admin_list_user_approvals
--   admin_list_channel_activity     admin_list_pending_content
--   admin_set_post_status           admin_set_post_access_level
--   admin_set_user_approval         admin_resolve_report
--   admin_update_post               admin_replace_post_video
--   admin_set_signed_lock           admin_clear_signed_lock
--   approve_channel_content         reject_channel_content
--   approve_post                    reject_post
--   is_owner_or_admin

NOTIFY pgrst, 'reload schema';
