-- Migration v39: Security hardening — critical fixes from Batch 11 audit
--
-- Fixes (priority order):
--   CRITICAL: increment_storage_used / decrement_storage_used accept arbitrary
--     p_user_id with no auth.uid() check — any authenticated user can manipulate
--     anyone else's storage counter. Add caller-must-equal-target check.
--
--   HIGH: record_post_view granted to PUBLIC + anon — bots can spam view_count
--     to poison Popular/Most Watched filters. Remove anon grant, require
--     authenticated user.
--
--   HIGH: update_channel has no input validation — p_name can be empty/NULL/
--     arbitrarily long. Add trim + length check.

-- ─── 1. Storage counter functions: caller must equal target ───────────────
create or replace function public.increment_storage_used(p_user_id uuid, p_bytes bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if auth.uid() <> p_user_id then
    raise exception 'Cannot modify storage counter for another user' using errcode = '42501';
  end if;
  if p_bytes is null or p_bytes < 0 then
    raise exception 'Bytes must be a non-negative integer' using errcode = '22023';
  end if;
  update public.profiles
    set storage_used = storage_used + p_bytes
    where id = p_user_id;
end;
$$;

create or replace function public.decrement_storage_used(p_user_id uuid, p_bytes bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if auth.uid() <> p_user_id then
    raise exception 'Cannot modify storage counter for another user' using errcode = '42501';
  end if;
  if p_bytes is null or p_bytes < 0 then
    raise exception 'Bytes must be a non-negative integer' using errcode = '22023';
  end if;
  update public.profiles
    set storage_used = greatest(0, storage_used - p_bytes)
    where id = p_user_id;
end;
$$;

-- ─── 2. record_post_view: revoke anon, keep authenticated only ───────────
revoke execute on function public.record_post_view(uuid) from anon;
revoke execute on function public.record_post_view(uuid) from PUBLIC;
grant execute on function public.record_post_view(uuid) to authenticated;

-- ─── 3. update_channel: input validation ───────────────────────────────
create or replace function public.update_channel(
  p_channel_id uuid,
  p_name text,
  p_description text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_row public.channels;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.is_owner_or_admin(p_channel_id) then
    raise exception 'Forbidden: not owner or admin' using errcode = '42501';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'Channel name cannot be empty' using errcode = '22023';
  end if;
  if length(p_name) > 100 then
    raise exception 'Channel name must be 100 characters or fewer' using errcode = '22023';
  end if;
  if p_description is not null and length(p_description) > 2000 then
    raise exception 'Channel description must be 2000 characters or fewer' using errcode = '22023';
  end if;
  update public.channels
    set name = trim(p_name),
        description = p_description,
        updated_at = now()
    where id = p_channel_id
    returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

NOTIFY pgrst, 'reload schema';