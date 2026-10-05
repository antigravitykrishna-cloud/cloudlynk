-- Migration v36: Allow channel owners to post content to their own channel
-- without requiring the global can_upload_content flag.

create or replace function public.can_post_to_channel(p_channel_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and (pr.is_admin = true or pr.can_upload_content = true)
  )
  or exists (
    select 1 from public.channels c
    where c.id = p_channel_id and c.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.channel_members cm
    where cm.channel_id = p_channel_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'moderator')
  );
$$;

grant execute on function public.can_post_to_channel(uuid) to authenticated;
NOTIFY pgrst, 'reload schema';
