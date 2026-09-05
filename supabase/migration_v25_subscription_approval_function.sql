-- Migration v25: SECURITY DEFINER function for subscription approval
--
-- WHY: PostgREST RLS on profiles is finicky when multiple UPDATE policies exist
-- for the same role. The admin's update silently returns 0 rows even though
-- the new "Admins can update any profile" policy is in place — no error
-- returned, but the row doesn't update. This is a known issue with stacked
-- RLS policies on tables that have both self-update and admin-update
-- semantics. The user-side subscription_requests update works (only one
-- policy on that table) — confirms the issue is profiles-specific.
--
-- The fix: replace the multi-step JS approval (update request + update profile)
-- with a single SECURITY DEFINER function call. The function runs as the
-- function owner (postgres) and bypasses RLS. Admins call it via RPC. The
-- function still verifies the caller is admin (defense in depth).
--
-- Also: add get_my_subscription_status() so the user's status page can show
-- the latest request + current plan state in a single round trip.

-- ─── approve_subscription_request: admin-only RPC ──────────────────────────
-- Marks the request as approved and activates the user's plan in one call.
-- Returns the updated subscription_request row.

create or replace function public.approve_subscription_request(p_request_id uuid)
returns public.subscription_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_req public.subscription_requests;
  v_plan_days int;
begin
  -- Defense in depth: only admins can approve
  select is_admin into v_is_admin from public.profiles where id = v_caller;
  if v_is_admin is not true then
    raise exception 'Forbidden: caller is not admin (uid=%)', v_caller
      using errcode = '42501';
  end if;

  -- Lock the request row to prevent double-approval
  select * into v_req from public.subscription_requests
    where id = p_request_id for update;
  if not found then
    raise exception 'Subscription request % not found', p_request_id
      using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Subscription request % is already %', p_request_id, v_req.status
      using errcode = 'P0001';
  end if;

  -- Look up the plan duration
  select duration_days into v_plan_days from public.subscription_plans
    where code = v_req.plan_code;
  if v_plan_days is null then
    v_plan_days := 30;
  end if;

  -- Mark the request approved
  update public.subscription_requests
    set status = 'approved',
        reviewed_by = v_caller,
        reviewed_at = now(),
        updated_at = now()
    where id = p_request_id
    returning * into v_req;

  -- Activate the user's plan
  update public.profiles
    set plan = 'standard',
        plan_status = 'active',
        plan_started_at = now(),
        plan_expires_at = now() + (v_plan_days || ' days')::interval
    where id = v_req.user_id;

  return v_req;
end;
$$;

-- Allow authenticated users to call the function (admin check is inside)
grant execute on function public.approve_subscription_request(uuid) to authenticated;

-- ─── reject_subscription_request: admin-only RPC ───────────────────────────

create or replace function public.reject_subscription_request(
  p_request_id uuid,
  p_reason text default 'Payment not verified'
)
returns public.subscription_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_req public.subscription_requests;
begin
  select is_admin into v_is_admin from public.profiles where id = v_caller;
  if v_is_admin is not true then
    raise exception 'Forbidden: caller is not admin' using errcode = '42501';
  end if;

  select * into v_req from public.subscription_requests
    where id = p_request_id for update;
  if not found then
    raise exception 'Subscription request % not found', p_request_id
      using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Subscription request % is already %', p_request_id, v_req.status
      using errcode = 'P0001';
  end if;

  update public.subscription_requests
    set status = 'rejected',
        rejection_reason = p_reason,
        reviewed_by = v_caller,
        reviewed_at = now(),
        updated_at = now()
    where id = p_request_id
    returning * into v_req;

  return v_req;
end;
$$;

grant execute on function public.reject_subscription_request(uuid, text) to authenticated;

-- ─── get_my_subscription_status: user-side helper ──────────────────────────
-- Returns the current user's plan state + their latest subscription request.
-- One round trip for the status page.

create or replace function public.get_my_subscription_status()
returns table (
  plan_status text,
  plan_expires_at timestamptz,
  plan_started_at timestamptz,
  latest_request_id uuid,
  latest_request_plan_code text,
  latest_request_amount_inr int,
  latest_request_status text,
  latest_request_screenshot_path text,
  latest_request_rejection_reason text,
  latest_request_created_at timestamptz,
  latest_request_reviewed_at timestamptz
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    p.plan_status,
    p.plan_expires_at,
    p.plan_started_at,
    r.id as latest_request_id,
    r.plan_code as latest_request_plan_code,
    r.amount_inr as latest_request_amount_inr,
    r.status as latest_request_status,
    r.screenshot_path as latest_request_screenshot_path,
    r.rejection_reason as latest_request_rejection_reason,
    r.created_at as latest_request_created_at,
    r.reviewed_at as latest_request_reviewed_at
  from public.profiles p
  left join lateral (
    select * from public.subscription_requests sr
    where sr.user_id = p.id
    order by sr.created_at desc
    limit 1
  ) r on true
  where p.id = auth.uid();
$$;

grant execute on function public.get_my_subscription_status() to authenticated;
