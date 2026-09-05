-- Create the payment-screenshots storage bucket
-- Run via: npx supabase db query --linked -f supabase/migration_v23_create_payment_screenshots_bucket.sql

-- Note: supabase CLI does not have a direct bucket-create command. We need to:
-- 1. Create the bucket via the storage.buckets INSERT (requires service role key in app code, not SQL)
-- 2. OR create via Supabase Dashboard > Storage > New bucket
-- 3. OR use the management API: POST /v1/projects/{ref}/storage/buckets

-- Since we don't have a direct SQL path, this migration just documents the policies.
-- The bucket itself must be created via the dashboard OR the management API.

-- The actual SQL we'll run separately via supabase db query is below.
-- This file is a documentation reference for the policies that need to exist.

/*
BUCKET: payment-screenshots
- Name: payment-screenshots
- Public: false (private)
- File size limit: 5MB
- Allowed MIME types: image/jpeg, image/png, image/webp

POLICIES (run via supabase db query --linked):

1. "payment-screenshots owner upload" (INSERT)
   on storage.objects for insert to authenticated
   with check (
     bucket_id = 'payment-screenshots' and
     (storage.foldername(name))[1] = auth.uid()::text
   );

2. "payment-screenshots owner read own" (SELECT)
   on storage.objects for select to authenticated
   using (
     bucket_id = 'payment-screenshots' and
     (storage.foldername(name))[1] = auth.uid()::text
   );

3. "payment-screenshots admin read all" (SELECT)
   on storage.objects for select to authenticated
   using (
     bucket_id = 'payment-screenshots' and
     exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
   );

4. "payment-screenshots admin write" (UPDATE, DELETE)
   on storage.objects for all to authenticated
   using (
     bucket_id = 'payment-screenshots' and
     exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
   )
   with check (
     bucket_id = 'payment-screenshots' and
     exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
   );
*/
