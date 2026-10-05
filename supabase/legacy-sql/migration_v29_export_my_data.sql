-- Migration v29: SECURITY DEFINER export_my_data function
--
-- CONTEXT: PR-9 — security + privacy. We need a way for users to download
-- all their data (GDPR / data portability right). Returns a JSONB blob with
-- everything tied to the calling user:
--   - profile (from profiles)
--   - channel memberships
--   - channel_posts (authored)
--   - subscription_requests (with plan_code + status + amounts)
--   - subscription_plans (just the metadata for reference)
--   - storage files (just paths, not actual files — client downloads separately)
--
-- Returns JSONB so the client can serialize it to a file and present via
-- the iOS/Android share sheet.
--
-- SECURITY DEFINER with `set search_path = public` to avoid search-path hijack.
-- is_admin is NOT required — any authenticated user can export their own data.
-- The function uses auth.uid() everywhere, so users can't read each other's data.

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
      select coalesce(jsonb_agg(to_jsonb(cm) order by cm.created_at), '[]'::jsonb)
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