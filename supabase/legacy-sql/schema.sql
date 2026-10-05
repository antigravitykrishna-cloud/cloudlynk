-- ============================================================
-- JOLLIFY: CLOUD & CHANNEL — SUPABASE SCHEMA
-- Run this in the Supabase SQL editor
-- ============================================================

-- EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

-- Profiles
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text,
  avatar_url      text,
  storage_used    bigint not null default 0,
  storage_limit   bigint not null default 16106127360, -- 15 GB free
  plan            text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Channels (create before files to allow FK)
create table if not exists public.channels (
  id                  uuid primary key default uuid_generate_v4(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  name                text not null,
  description         text,
  is_public           boolean not null default true,
  status              text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  member_count        integer not null default 0,
  post_count          integer not null default 0,
  media_size          bigint not null default 0,
  approval_expires_at timestamptz,
  created_at          timestamptz not null default now()
);

-- Files
create table if not exists public.files (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null,
  size            bigint not null default 0,
  mime_type       text not null default 'application/octet-stream',
  storage_path    text not null,
  category        text not null default 'other' check (category in ('photo', 'video', 'document', 'audio', 'other')),
  channel_id      uuid references public.channels(id) on delete set null,
  is_public       boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Channel Members
create table if not exists public.channel_members (
  channel_id  uuid not null references public.channels(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'moderator', 'member')),
  joined_at   timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- Transfers (audit log)
create table if not exists public.transfers (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  file_name   text not null,
  file_size   bigint not null default 0,
  progress    integer not null default 0 check (progress between 0 and 100),
  status      text not null default 'uploading' check (status in ('uploading', 'downloading', 'completed', 'failed', 'paused')),
  type        text not null default 'upload' check (type in ('upload', 'download')),
  created_at  timestamptz not null default now()
);

-- Content Reports (DMCA)
create table if not exists public.content_reports (
  id          uuid primary key default uuid_generate_v4(),
  channel_id  uuid references public.channels(id) on delete cascade,
  file_id     uuid references public.files(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text not null,
  status      text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists files_user_id_idx        on public.files(user_id);
create index if not exists files_category_idx        on public.files(category);
create index if not exists files_created_at_idx      on public.files(created_at desc);
create index if not exists channels_status_idx        on public.channels(status);
create index if not exists channels_is_public_idx     on public.channels(is_public);
create index if not exists channel_members_user_idx   on public.channel_members(user_id);
create index if not exists transfers_user_id_idx      on public.transfers(user_id);

-- ============================================================
-- TRIGGERS — updated_at
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create profile on sign up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Storage accounting
create or replace function public.increment_storage_used(p_user_id uuid, p_bytes bigint)
returns void language plpgsql security definer as $$
begin
  update public.profiles
  set storage_used = storage_used + p_bytes
  where id = p_user_id;
end;
$$;

create or replace function public.decrement_storage_used(p_user_id uuid, p_bytes bigint)
returns void language plpgsql security definer as $$
begin
  update public.profiles
  set storage_used = greatest(0, storage_used - p_bytes)
  where id = p_user_id;
end;
$$;

-- Channel member count
create or replace function public.increment_channel_members(p_channel_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.channels
  set member_count = member_count + 1
  where id = p_channel_id;
end;
$$;

-- Auto-activate public channels after 7-day review
create or replace function public.activate_approved_channels()
returns void language plpgsql security definer as $$
begin
  update public.channels
  set status = 'active'
  where status = 'pending'
    and is_public = true
    and approval_expires_at <= now();
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles        enable row level security;
alter table public.files            enable row level security;
alter table public.channels         enable row level security;
alter table public.channel_members  enable row level security;
alter table public.transfers        enable row level security;
alter table public.content_reports  enable row level security;

-- Profiles
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Files
create policy "Users can view own files"
  on public.files for select using (auth.uid() = user_id);

create policy "Users can view public channel files"
  on public.files for select
  using (is_public = true and channel_id is not null);

create policy "Users can insert own files"
  on public.files for insert with check (auth.uid() = user_id);

create policy "Users can delete own files"
  on public.files for delete using (auth.uid() = user_id);

create policy "Users can update own files"
  on public.files for update using (auth.uid() = user_id);

-- Channels
create policy "Anyone can view active public channels"
  on public.channels for select
  using (is_public = true and status = 'active');

create policy "Members can view private channels"
  on public.channels for select
  using (
    exists (
      select 1 from public.channel_members
      where channel_id = channels.id and user_id = auth.uid()
    )
  );

create policy "Authenticated users can create channels"
  on public.channels for insert with check (auth.uid() = owner_id);

create policy "Owners can update their channels"
  on public.channels for update using (auth.uid() = owner_id);

create policy "Owners can delete their channels"
  on public.channels for delete using (auth.uid() = owner_id);

-- Channel Members
create policy "Members can view memberships"
  on public.channel_members for select using (auth.uid() = user_id);

create policy "Users can join channels"
  on public.channel_members for insert with check (auth.uid() = user_id);

create policy "Users can leave channels"
  on public.channel_members for delete using (auth.uid() = user_id);

-- Transfers
create policy "Users own their transfers"
  on public.transfers for all using (auth.uid() = user_id);

-- Content Reports
create policy "Users can report content"
  on public.content_reports for insert with check (auth.uid() = reporter_id);

create policy "Users can view own reports"
  on public.content_reports for select using (auth.uid() = reporter_id);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-files',
  'user-files',
  false,
  1073741824, -- 1 GB per file
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'application/x-zip-compressed',
    'text/plain', 'text/csv',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- Storage RLS — users can only access their own folder
create policy "Users access own storage folder"
  on storage.objects for all
  using (
    bucket_id = 'user-files' and
    (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-files' and
    (storage.foldername(name))[1] = auth.uid()::text
  );
