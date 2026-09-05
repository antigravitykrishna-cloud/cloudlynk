-- v55: Admin approval gate — who is ALLOWED TO SUBSCRIBE.
--
-- ═══════════════════════════════════════════════════════════════
-- READ THIS BEFORE CHANGING ANYTHING BELOW
-- ═══════════════════════════════════════════════════════════════
--
-- This is a PRE-PURCHASE vetting gate and nothing else. An account that an
-- admin has not approved never reaches the subscribe flow (app/premium.tsx
-- shows a "your account is being reviewed" state instead of the plan list).
--
-- It must NEVER be used to withhold an entitlement AFTER money has changed
-- hands. That specific shape — take the payment, then park the entitlement
-- pending a human click — is what got this app removed from Google Play
-- once already (docs/PLAY_STORE_COMPLIANCE_AUDIT.md Finding 1, the old
-- UPI + screenshot + admin-approval flow, since deleted). Google Play's
-- Payments policy is about not withholding what a user paid for; it says
-- nothing about who you let into your app, which is why the gate sits
-- before the purchase rather than after it.
--
-- Concretely: supabase/functions/verify-play-receipt/index.ts and
-- play-rtdn-webhook/index.ts do not read approval_status and must not start.
-- If an unapproved account somehow completes a real purchase (modified
-- client, a race with a rejection, a restore of an older purchase), the
-- plan is granted exactly as it would be for an approved account.
--
-- Admin control over sensitive CONTENT belongs in a separate per-content
-- grant system, not in the payment path.

-- ═══════════════════════════════════════════════════════════════
-- 0. Let this migration's own backfill through the privileged-fields trigger
-- ═══════════════════════════════════════════════════════════════
--
-- protect_profile_privileged_fields() (v48, amended in v52) reverts
-- privileged columns for any writer it doesn't trust, and section 3 below
-- adds the new approval columns to that list. The backfill in section 2
-- runs first (so the not-yet-replaced trigger doesn't know about them
-- either), but set this anyway so the ordering isn't load-bearing.
-- is_local = true scopes it to this migration's transaction.
SELECT set_config('app.trusted_update', 'true', true);

-- ═══════════════════════════════════════════════════════════════
-- 1. Columns
-- ═══════════════════════════════════════════════════════════════
--
-- approval_status is added with DEFAULT 'approved' and only then switched
-- to DEFAULT 'pending'. That is deliberate and is the whole backfill: every
-- row that exists at migration time gets 'approved' from the column default
-- as the column is created, and 'pending' applies to accounts created from
-- this point on. Doing it this way (rather than adding the column as
-- 'pending' and UPDATE-ing everyone to 'approved') keeps the migration
-- safely re-runnable — a second run is a no-op instead of silently
-- approving every account that is legitimately awaiting review.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'approved';

-- Covers the drift case where the column already exists but is nullable.
UPDATE public.profiles SET approval_status = 'approved' WHERE approval_status IS NULL;

ALTER TABLE public.profiles ALTER COLUMN approval_status SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN approval_status SET DEFAULT 'pending';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_approval_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_reviewed_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_reviewed_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_note text;

-- The admin queue filters on this.
CREATE INDEX IF NOT EXISTS idx_profiles_approval_status ON public.profiles(approval_status);

COMMENT ON COLUMN public.profiles.approval_status IS
  'Pre-purchase vetting gate: whether an admin has cleared this account to reach the subscribe flow. NEVER use this to withhold or revoke an entitlement after a payment has been taken — verify-play-receipt grants the plan regardless of this value, by design. Unapproved accounts keep a fully working free tier.';

COMMENT ON COLUMN public.profiles.approval_reviewed_by IS
  'Admin who last set approval_status, via admin_set_user_approval(). Audit trail for the pre-purchase vetting gate; carries no entitlement meaning.';

COMMENT ON COLUMN public.profiles.approval_reviewed_at IS
  'When approval_status was last set by an admin. Audit trail for the pre-purchase vetting gate; carries no entitlement meaning.';

COMMENT ON COLUMN public.profiles.approval_note IS
  'Free-text admin note explaining the last approval decision. Internal audit only — never a reason to withhold something already paid for.';

-- ═══════════════════════════════════════════════════════════════
-- 2. Backfill: admins are always approved
-- ═══════════════════════════════════════════════════════════════
--
-- Section 1's column default already approved every pre-existing account.
-- This is the one case that must hold on every run, not just the first:
-- an admin who somehow ends up 'pending' cannot reach the screen that
-- would un-pend them.

UPDATE public.profiles
  SET approval_status = 'approved'
  WHERE is_admin = true AND approval_status <> 'approved';

-- ═══════════════════════════════════════════════════════════════
-- 3. The approval columns are not self-editable
-- ═══════════════════════════════════════════════════════════════
--
-- Without this, a user can approve themselves with a plain
-- `supabase.from('profiles').update({ approval_status: 'approved' })`,
-- which defeats the entire feature. Re-declared in full from the current
-- v52 version of the function (which replaced v48's storage_limit branch
-- with a flat 15GB) with the four new columns appended to the revert list;
-- nothing else about the function changes.

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_trusted boolean;
BEGIN
  is_trusted := (
    coalesce(current_setting('app.trusted_update', true), '') = 'true'
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
    -- `plan` is a legacy column (superseded by plan_status) still read by the
    -- app for client-side paid gating, so it must not be self-editable either.
    NEW.plan := OLD.plan;
    -- v55: the pre-purchase approval gate. Self-approval would make the
    -- gate meaningless — only admin_set_user_approval() may move these.
    NEW.approval_status := OLD.approval_status;
    NEW.approval_reviewed_by := OLD.approval_reviewed_by;
    NEW.approval_reviewed_at := OLD.approval_reviewed_at;
    NEW.approval_note := OLD.approval_note;
  END IF;

  -- v52: flat 15GB for every account regardless of plan_status. Premium no
  -- longer buys storage — it buys access to premium-flagged content. Never
  -- silently shrinks anyone's *usable* storage below what they've already
  -- stored: increment_storage_used (unchanged) only blocks NEW uploads once
  -- storage_used would exceed storage_limit — it never deletes existing
  -- files, so a formerly-2TB account that's stored more than 15GB simply
  -- can't upload more until they free space, exactly like hitting the
  -- free-tier cap today.
  NEW.storage_limit := 16106127360; -- 15 GB, same constant as the free tier before v52

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 4. is_user_approved() — one place that knows what "approved" means
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_user_approved(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND approval_status = 'approved'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_approved(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_user_approved(uuid) IS
  'True when this account has been cleared by an admin to reach the subscribe flow. Read-side helper for the PRE-purchase gate only — must not be consulted anywhere in the payment-verification path.';

-- ═══════════════════════════════════════════════════════════════
-- 5. admin_set_user_approval() — the actual security boundary
-- ═══════════════════════════════════════════════════════════════
--
-- Same shape as admin_resolve_report (v48): re-verifies is_admin inside the
-- function rather than trusting the calling screen, and sets
-- app.trusted_update so its own UPDATE gets past the trigger in section 3.
-- app/admin/user-approvals.tsx's isAdmin check is UX, this is enforcement.

CREATE OR REPLACE FUNCTION public.admin_set_user_approval(
  p_user_id uuid,
  p_status text,             -- 'approved' | 'rejected'
  p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid approval status: %', p_status USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Profile % not found', p_user_id;
  END IF;

  PERFORM set_config('app.trusted_update', 'true', true);

  UPDATE public.profiles
  SET approval_status = p_status,
      approval_reviewed_by = auth.uid(),
      approval_reviewed_at = now(),
      approval_note = p_note
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_approval(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_set_user_approval(uuid, text, text) IS
  'Admin-only. Sets the PRE-purchase approval gate on an account. Rejecting an account stops it reaching the subscribe flow; it does NOT revoke, downgrade or park any plan the account has already paid for — plan_status is deliberately untouched here.';

-- ═══════════════════════════════════════════════════════════════
-- 6. admin_list_user_approvals() — the queue the admin screen reads
-- ═══════════════════════════════════════════════════════════════
--
-- profiles has no admin-wide SELECT policy: the only SELECT policy on the
-- table is `auth.uid() = id` (schema.sql, re-asserted in migration_v4), so
-- an admin querying `from('profiles').select(...)` over other people's rows
-- gets nothing back — RLS filters them out silently rather than erroring.
-- app/admin/user-approvals.tsx would therefore render a permanently empty
-- queue if it read the table directly.
--
-- Fixed here with a SECURITY DEFINER reader rather than by adding a
-- blanket "admins can read all profiles" policy: this exposes exactly the
-- eight columns the vetting screen needs and nothing else, and re-verifies
-- is_admin itself, so widening it later is a deliberate act rather than a
-- side effect. (The same missing-policy gap is why app/admin/reports.tsx's
-- reporter/reported-user name enrichment shows 'Unknown' — pre-existing,
-- untouched here, and worth a separate look.)

CREATE OR REPLACE FUNCTION public.admin_list_user_approvals(
  p_status text DEFAULT 'pending',
  p_limit int DEFAULT 200
) RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  username text,
  created_at timestamptz,
  approval_status text,
  approval_note text,
  approval_reviewed_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid approval status: %', p_status USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.username, p.created_at,
         p.approval_status, p.approval_note, p.approval_reviewed_at
  FROM public.profiles p
  WHERE p.approval_status = p_status
  ORDER BY
    -- Oldest first while vetting; most-recently-decided first when reviewing
    -- what has already been handled.
    CASE WHEN p_status = 'pending' THEN p.created_at END ASC,
    CASE WHEN p_status <> 'pending' THEN p.approval_reviewed_at END DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 200), 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_user_approvals(text, int) TO authenticated;

COMMENT ON FUNCTION public.admin_list_user_approvals(text, int) IS
  'Admin-only reader for the pre-purchase vetting queue (app/admin/user-approvals.tsx). Exists because profiles has no admin-wide SELECT policy; deliberately returns only the columns that screen displays.';

NOTIFY pgrst, 'reload schema';
