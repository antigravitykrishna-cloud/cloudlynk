// Adds 4 storage policies to the channel-videos bucket
// Uses supabase-js Management API (PostgREST) with the service role key
// We connect directly to the database using the postgres connection string from env

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
});

// Try to find a postgres connection string. Supabase exposes:
// - SUPABASE_DB_URL (full postgres://...)
// - Or we construct from project ref + service key (no, that doesn't work for postgres)
const dbUrl = env.SUPABASE_DB_URL || env.DATABASE_URL;

if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL or DATABASE_URL in .env');
  console.error('Add SUPABASE_DB_URL=postgres://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres to .env');
  console.error('You can find it in Supabase Dashboard > Settings > Database > Connection string > URI');
  process.exit(1);
}

const SQL = `
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
`;

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  console.log('✓ Connected to Supabase Postgres');
  try {
    await client.query(SQL);
    console.log('✓ 4 storage policies created successfully');
    
    // Verify
    const res = await client.query(`
      select policyname, cmd, roles::text
      from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname like 'channel-videos%'
      order by policyname
    `);
    console.log('\nPolicies in DB:');
    res.rows.forEach(r => console.log(`  - ${r.policyname} (${r.cmd})`));
  } catch (e) {
    console.error('✗ SQL failed:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
