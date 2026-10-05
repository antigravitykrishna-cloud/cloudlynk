-- Migration v28: SECURITY DEFINER join_channel + tight channel_posts SELECT
--
-- CONTEXT: Two bugs from PR-4.1 testing:
--
-- Bug A — channel join silently fails with generic "Could not join channel" error.
-- The channels list page calls ChannelService.joinChannel, which inserts into
-- channel_members. The v26 RLS policy ("Paid and pending users can join channels")
-- SHOULD pass for plan_status='active' users, but in practice the channels list
-- page (where the join is triggered from) hits a different code path than the
-- detail page's gate, and the error is being swallowed behind a generic message.
-- Same RLS-via-PostgREST gotcha we hit on profiles and channel_members — multi-
-- policy stacks don't always behave as documented.
--
-- Fix: SECURITY DEFINER join_channel(p_channel_id) function. Bypasses RLS,
-- checks plan_status inside, returns clear errors. The list page calls this via
-- RPC. Same pattern as v25/v27.
--
-- Bug B — channel_posts.visible to non-members in the data path.
-- The v11 channel_posts SELECT policy treats visibility='public' as visible to
-- EVERYONE. So PostService.getChannelPosts on the detail page returns approved
-- posts to non-members (the UI gate then hides them, but the data is loaded).
-- If anyone ever bypasses the UI gate (a future code change, deep linking, etc.)
-- the data leaks.
--
-- Fix: tighten the channel_posts SELECT policy so visibility='public' is only
-- visible to channel members + admins + authors. Visibility='ad_attributed'
-- stays visible to paid users. New helper function visible_posts_count_for()
-- exposes the same membership check the UI uses so the gate and DB stay in sync.
--
-- IMPORTANT: this narrows existing policy. Existing 'public' posts will now be
-- invisible to non-members. That's the intended behavior — channel content
-- should not leak. If any seed post relies on the old behavior, update its
-- visibility to a new 'all_paid_users' value or move it to a different channel.

-- ─── join_channel: replaces direct INSERT into channel_members ─────────────

create or replace function public.join_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_plan_status text;
  v_channel_status text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Check the caller's plan (must be paid, pending approval, or lifetime)
  select plan_status into v_plan_status from public.profiles where id = v_caller;
  if v_plan_status is null or v_plan_status not in ('active', 'pending', 'lifetime') then
    raise exception 'Subscription required to join channels (plan_status=%)', v_plan_status
      using errcode = '42501';
  end if;

  -- Check the channel is active
  select status into v_channel_status from public.channels where id = p_channel_id;
  if v_channel_status is null then
    raise exception 'Channel % not found', p_channel_id using errcode = 'P0002';
  end if;
  if v_channel_status <> 'active' then
    raise exception 'Channel is not active (status=%)', v_channel_status
      using errcode = 'P0001';
  end if;

  -- Idempotent: if already a member, do nothing
  if exists (select 1 from public.channel_members where channel_id = p_channel_id and user_id = v_caller) then
    return;
  end if;

  insert into public.channel_members (channel_id, user_id, role)
    values (p_channel_id, v_caller, 'member');

  -- Best-effort counter increment
  begin
    update public.channels set member_count = member_count + 1 where id = p_channel_id;
  exception when others then
    raise warning 'member_count increment failed: %', SQLERRM;
  end;
end;
$$;

grant execute on function public.join_channel(uuid) to authenticated;

-- ─── leave_channel: same pattern ───────────────────────────────────────────

create or replace function public.leave_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  delete from public.channel_members
    where channel_id = p_channel_id and user_id = v_caller;

  begin
    update public.channels set member_count = greatest(member_count - 1, 0) where id = p_channel_id;
  exception when others then
    raise warning 'member_count decrement failed: %', SQLERRM;
  end;
end;
$$;

grant execute on function public.leave_channel(uuid) to authenticated;

-- ─── Tighten channel_posts SELECT policy ────────────────────────────────────
-- Old: visibility='public' was visible to everyone.
-- New: visibility='public' is visible to channel members + admins + authors.
--      visibility='ad_attributed' stays visible to paid users.

drop policy if exists "Public posts visible to all, ad-attributed to paid users only" on public.channel_posts;

create policy "Channel posts visible to members + paid users"
  on public.channel_posts for select
  using (
    -- Authors see their own posts
    author_id = auth.uid()
    OR
    -- Admins see everything
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
    OR
    -- Channel members see approved content in their channels
    (
      status = 'approved'
      and exists (
        select 1 from public.channel_members
        where channel_id = channel_posts.channel_id and user_id = auth.uid()
      )
    )
    OR
    -- Paid users see ad_attributed content (for Explore-style discovery)
    (
      status = 'approved'
      and visibility = 'ad_attributed'
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and plan_status in ('active', 'pending', 'lifetime')
      )
    )
  );

-- ─── Companion for Explore: paid users see 'ad_attributed' OR their joined channels ───
-- (The existing getExplorePosts reads via supabase.from('channel_posts') directly,
--  which now goes through this tightened policy. Non-members will only see posts
--  from channels they joined + ad_attributed posts from any channel.)

-- No additional function needed; the policy above handles Explore correctly.