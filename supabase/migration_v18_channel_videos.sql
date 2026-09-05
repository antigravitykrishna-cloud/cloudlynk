-- Migration v18: channel_videos table for sample video uploads on channel creation
-- Applied by: admin via Supabase SQL editor
-- Date: 2026-06-16

create table public.channel_videos (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  storage_path text not null,
  thumbnail_path text,
  title text,
  description text,
  duration_seconds int,
  file_size_bytes bigint,
  mime_type text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index channel_videos_channel_idx on public.channel_videos (channel_id, status);
create index channel_videos_uploader_idx on public.channel_videos (uploaded_by);

alter table public.channel_videos enable row level security;

-- Owners can read their own videos
create policy "Users can read own videos" on public.channel_videos
  for select using (uploaded_by = auth.uid());

-- Channel members can read approved videos in channels they joined
create policy "Members can read approved videos" on public.channel_videos
  for select using (
    status = 'approved' and exists (
      select 1 from public.channel_members
      where channel_members.channel_id = channel_videos.channel_id
      and channel_members.user_id = auth.uid()
    )
  );

-- Admins can read everything
create policy "Admins can read all videos" on public.channel_videos
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Owners can insert their own videos
create policy "Users can insert own videos" on public.channel_videos
  for insert with check (uploaded_by = auth.uid());

-- Owners can update their own videos (only while pending)
create policy "Users can update own pending videos" on public.channel_videos
  for update using (uploaded_by = auth.uid() and status = 'pending');

-- Admins can update any video (for approve/reject)
create policy "Admins can update any video" on public.channel_videos
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Owners can delete their own pending videos
create policy "Users can delete own pending videos" on public.channel_videos
  for delete using (uploaded_by = auth.uid() and status = 'pending');

-- Admins can delete any video
create policy "Admins can delete any video" on public.channel_videos
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ============================================================
-- Storage bucket: channel-videos
-- Create manually in Supabase Dashboard > Storage > New Bucket:
--   Name: channel-videos
--   Public: false
--   File size limit: 30MB
--   Allowed MIME types: video/mp4, video/quicktime, video/x-msvideo, video/webm
--
-- Then add these storage policies in the Dashboard:
--
-- Policy: "Owner upload" (INSERT)
--   Target role: authenticated
--   Policy: (bucket_id = 'channel-videos' AND (storage.foldername(name))[1] = auth.uid()::text)
--
-- Policy: "Owner read own" (SELECT)
--   Target role: authenticated
--   Policy: (bucket_id = 'channel-videos' AND (storage.foldername(name))[1] = auth.uid()::text)
--
-- Policy: "Admin full access" (SELECT, INSERT, UPDATE, DELETE)
--   Target role: authenticated
--   Policy: (bucket_id = 'channel-videos' AND exists(select 1 from public.profiles where id = auth.uid() and is_admin = true))
--
-- Policy: "Public read approved" (SELECT)
--   Target role: anon, authenticated
--   Policy: (bucket_id = 'channel-videos' AND exists(select 1 from public.channel_videos where storage_path = name and status = 'approved'))
-- ============================================================

-- ============================================================
-- Admin operations (run in SQL editor):
--
-- To approve a video as admin:
-- update public.channel_videos set status = 'approved', updated_at = now() where id = 'VIDEO_UUID';
--
-- To reject:
-- update public.channel_videos set status = 'rejected', rejection_reason = 'Reason here', updated_at = now() where id = 'VIDEO_UUID';
-- ============================================================
