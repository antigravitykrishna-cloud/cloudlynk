-- Migration v27: SECURITY DEFINER functions for channel post approval + user status helper
--
-- CONTEXT: PR-4 — channel detail + video upload.
--
-- The `channel_videos` table (v18) is a dead path. The channel detail page's
-- CreateModal writes to `channel_posts` (with streamVideoUid pointing to
-- Cloudflare Stream), but the existing admin queue in `pending-channels.tsx`
-- only watches `channel_videos`. Admin never sees real submissions.
--
-- This migration adds:
-- 1. approve_post / reject_post RPCs (SECURITY DEFINER, is_admin check inside)
--    — same pattern as v25 subscription RPCs, RLS-bypass via function owner.
-- 2. get_my_channel_posts(p_status_filter) — user-side helper for the new
--    "My Videos" page that lists the user's own submissions across channels.
--
-- It does NOT drop the channel_videos table — there are 2 approved rows
-- historically. Leave the table and policies in place; nothing writes to it
-- anymore but the admin queue still shows those legacy rows.

-- ─── approve_post: admin-only RPC ───────────────────────────────────────────
-- Marks a channel_post as approved, sets approved_by + approved_at.

create or replace function public.approve_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean;
begin
  select is_admin into v_is_admin from public.profiles where id = v_caller;
  if v_is_admin is not true then
    raise exception 'Forbidden: caller is not admin' using errcode = '42501';
  end if;

  update public.channel_posts
    set status = 'approved',
        approved_by = v_caller,
        approved_at = now()
    where id = p_post_id
      and status = 'pending';

  if not found then
    raise exception 'Post % not found or not in pending state', p_post_id
      using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.approve_post(uuid) to authenticated;

-- ─── reject_post: admin-only RPC ────────────────────────────────────────────
-- Marks a channel_post as rejected with a reason.

create or replace function public.reject_post(
  p_post_id uuid,
  p_reason text default 'Rejected by admin'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean;
begin
  select is_admin into v_is_admin from public.profiles where id = v_caller;
  if v_is_admin is not true then
    raise exception 'Forbidden: caller is not admin' using errcode = '42501';
  end if;

  update public.channel_posts
    set status = 'rejected',
        rejection_note = p_reason
    where id = p_post_id
      and status = 'pending';

  if not found then
    raise exception 'Post % not found or not in pending state', p_post_id
      using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.reject_post(uuid, text) to authenticated;

-- ─── get_my_channel_posts: user-side helper ─────────────────────────────────
-- Lists the current user's channel_posts across all channels, optionally
-- filtered by status. Used by the new /my-videos page.
-- Joins channel name + admin email for display.

create or replace function public.get_my_channel_posts(p_status text default null)
returns table (
  id uuid,
  channel_id uuid,
  channel_name text,
  title text,
  content_type text,
  thumbnail_url text,
  video_url text,
  status text,
  rejection_note text,
  created_at timestamptz,
  approved_at timestamptz
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    p.id, p.channel_id,
    c.name as channel_name,
    p.title, p.content_type, p.thumbnail_url, p.video_url,
    p.status, p.rejection_note, p.created_at, p.approved_at
  from public.channel_posts p
  left join public.channels c on c.id = p.channel_id
  where p.author_id = auth.uid()
    and (p_status is null or p.status = p_status)
  order by p.created_at desc
  limit 100;
$$;

grant execute on function public.get_my_channel_posts(text) to authenticated;
