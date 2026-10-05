-- Fix v31: DELETE statements need WHERE clause (Supabase safety rule)
-- Bug: demo_reset() had `delete from public.subscription_requests;` and
-- `delete from public.channel_members;` without WHERE clauses.
-- Supabase rejects DELETE without WHERE to prevent accidental table wipes.
-- Use WHERE true to express "delete all rows" explicitly.

create or replace function public.demo_reset()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_profiles_reset int;
  v_subs_deleted int;
  v_posts_pending int;
  v_memberships_deleted int;
begin
  select is_admin into v_is_admin from public.profiles where id = v_caller;
  if v_is_admin is not true then
    raise exception 'Forbidden: caller is not admin' using errcode = '42501';
  end if;

  -- 1. Reset all non-admin profiles to free
  update public.profiles
    set plan = 'free',
        plan_status = 'free',
        plan_expires_at = null,
        plan_started_at = null,
        plan_cancelled_at = null,
        iap_purchase_token = null,
        iap_product_id = null
    where is_admin is not true;
  get diagnostics v_profiles_reset = row_count;

  -- 2. Delete all subscription_requests
  delete from public.subscription_requests where true;
  get diagnostics v_subs_deleted = row_count;

  -- 3. Reset all channel_posts to pending (keeps content, requires re-approval)
  update public.channel_posts
    set status = 'pending',
        approved_by = null,
        approved_at = null,
        rejection_note = null
    where status <> 'pending';
  get diagnostics v_posts_pending = row_count;

  -- 4. Delete all channel memberships
  delete from public.channel_members where true;
  get diagnostics v_memberships_deleted = row_count;

  -- 5. Reset channel member_count denormalized counter to 0
  update public.channels set member_count = 0;

  return jsonb_build_object(
    'profiles_reset', v_profiles_reset,
    'subscription_requests_deleted', v_subs_deleted,
    'channel_posts_set_pending', v_posts_pending,
    'channel_memberships_deleted', v_memberships_deleted,
    'reset_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end;
$$;

grant execute on function public.demo_reset() to authenticated;