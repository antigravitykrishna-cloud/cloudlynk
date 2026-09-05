-- 4 storage policies for channel-videos bucket
-- Run this in Supabase SQL editor (same place you ran migration_v18)

-- Policy 1: Owner upload (INSERT) — user can upload to their own folder
drop policy if exists "channel-videos owner upload" on storage.objects;
create policy "channel-videos owner upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'channel-videos' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Owner read own (SELECT) — user can read their own files
drop policy if exists "channel-videos owner read own" on storage.objects;
create policy "channel-videos owner read own"
on storage.objects for select to authenticated
using (
  bucket_id = 'channel-videos' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 3: Admin full access (SELECT, INSERT, UPDATE, DELETE)
drop policy if exists "channel-videos admin full access" on storage.objects;
create policy "channel-videos admin full access"
on storage.objects for all to authenticated
using (
  bucket_id = 'channel-videos' and
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
)
with check (
  bucket_id = 'channel-videos' and
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- Policy 4: Public read approved (SELECT) — anyone can read files where the matching channel_videos row is approved
drop policy if exists "channel-videos public read approved" on storage.objects;
create policy "channel-videos public read approved"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'channel-videos' and
  exists (
    select 1 from public.channel_videos
    where storage_path = name and status = 'approved'
  )
);

-- Verify (should return 4 rows)
select policyname, cmd, roles::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'channel-videos%'
order by policyname;
