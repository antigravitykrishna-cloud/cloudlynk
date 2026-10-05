-- Migration v35: Secure channel mutation RPCs with ownership/admin checks
-- Fixes: non-owner non-admin users should not be able to update or delete channels

-- Helper: returns true if caller is the channel owner or a platform admin
create or replace function public.is_owner_or_admin(p_channel_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel_id
      and (c.owner_id = auth.uid()
           or exists (select 1 from public.profiles
                       where id = auth.uid() and is_admin = true))
  );
$$;

grant execute on function public.is_owner_or_admin(uuid) to authenticated;
NOTIFY pgrst, 'reload schema';

-- Secure channel update via RPC (replaces raw UPDATE from client)
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
  v_row public.channels;
begin
  if not public.is_owner_or_admin(p_channel_id) then
    raise exception 'Forbidden: not owner or admin' using errcode = '42501';
  end if;

  update public.channels
    set name = p_name,
        description = p_description,
        updated_at = now()
    where id = p_channel_id
    returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.update_channel(uuid, text, text) to authenticated;
NOTIFY pgrst, 'reload schema';

-- Secure channel delete via RPC (replaces raw DELETE from client)
create or replace function public.delete_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner_or_admin(p_channel_id) then
    raise exception 'Forbidden: not owner or admin' using errcode = '42501';
  end if;

  delete from public.channels where id = p_channel_id;
end;
$$;

grant execute on function public.delete_channel(uuid) to authenticated;
NOTIFY pgrst, 'reload schema';
