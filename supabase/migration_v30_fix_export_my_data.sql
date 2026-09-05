-- Fix v29: channel_members uses joined_at, not created_at
-- Bug: original v29 referenced cm.created_at which doesn't exist
-- on the channel_members table. Error: "column cm.created_at does not exist"

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'exported_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'user_id', v_user_id,
    'profile', (
      select to_jsonb(p) from public.profiles p where p.id = v_user_id
    ),
    'channel_memberships', (
      select coalesce(jsonb_agg(to_jsonb(cm) order by cm.joined_at), '[]'::jsonb)
      from public.channel_members cm
      where cm.user_id = v_user_id
    ),
    'channels_owned', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb)
      from public.channels c
      where c.owner_id = v_user_id
    ),
    'channel_posts_authored', (
      select coalesce(jsonb_agg(to_jsonb(cp) order by cp.created_at), '[]'::jsonb)
      from public.channel_posts cp
      where cp.author_id = v_user_id
    ),
    'subscription_requests', (
      select coalesce(jsonb_agg(to_jsonb(sr) order by sr.created_at), '[]'::jsonb)
      from public.subscription_requests sr
      where sr.user_id = v_user_id
    ),
    'uploaded_videos', (
      select coalesce(jsonb_agg(to_jsonb(cv) order by cv.created_at), '[]'::jsonb)
      from public.channel_videos cv
      where cv.uploaded_by = v_user_id
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.export_my_data() to authenticated;