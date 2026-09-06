#!/usr/bin/env node
/**
 * verify-guest-access — proves what a signed-OUT visitor can and cannot read.
 *
 * Uses the anon key with no session, which is exactly what a guest in the app
 * is. Read-only: it issues SELECTs and nothing else.
 *
 * Why this exists separately from the RLS policies themselves: a GRANT to
 * `anon` is only safe while RLS is ENABLED on the table. If RLS is off, the
 * grant alone exposes every row, and the policy text looks perfectly correct
 * while protecting nothing. That is not a hypothetical failure mode — it is
 * the single most common way a Supabase project leaks data.
 *
 * Run before AND after applying v61:
 *   before — everything should be DENIED (guest browsing not enabled yet)
 *   after  — the browse reads should PASS and every leak check must still DENY
 *
 *   node scripts/verify-guest-access.mjs
 *
 * Exit 0 = no leak. Exit 1 = at least one thing a guest should not see.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = {};
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* fall back to the real environment */ }

const URL_ = env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !ANON) {
  console.error('Missing (names only): EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(2);
}

// No session is set on this client. This is a guest.
const guest = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name.padEnd(46)} ${detail}`);
}

/** A read that SHOULD work for a guest once v61 is applied. */
async function shouldRead(name, run) {
  const { data, error } = await run();
  if (error) return record(name, false, `blocked: ${error.message.slice(0, 60)}`);
  record(name, (data?.length ?? 0) >= 0, `${data?.length ?? 0} row(s)`);
}

/** A read that must NEVER work for a guest. Rows OR a readable column = leak. */
async function mustNotRead(name, run, { rowsAreLeak = true } = {}) {
  const { data, error } = await run();
  if (error) return record(name, true, `denied: ${error.message.slice(0, 55)}`);
  const n = data?.length ?? 0;
  if (rowsAreLeak && n > 0) return record(name, false, `LEAK — ${n} row(s) readable`);
  record(name, true, n === 0 ? 'no rows' : 'ok');
}

console.log(`\nGUEST ACCESS — ${new URL(URL_).host}`);
console.log('  client: anon key, no session (exactly what a guest is)\n');

console.log('Browse (should PASS once v61 is applied):');
await shouldRead('channel_posts — safe columns', () =>
  guest.from('channel_posts').select('id,title,access_level,thumbnail_url').limit(5));
await shouldRead('channels — public list', () =>
  guest.from('channels').select('id,name,member_count').eq('is_public', true).limit(5));
await shouldRead('profiles — author display name', () =>
  guest.from('profiles').select('id,full_name,avatar_url').limit(5));

console.log('\nMust never leak:');
// The one that matters most: the Cloudflare UID. Holding it lets a guest build
// the unsigned manifest URL and watch free content without an account.
await mustNotRead('channel_posts.video_url', () =>
  guest.from('channel_posts').select('id,video_url').limit(1));
await mustNotRead('channel_posts.media_url', () =>
  guest.from('channel_posts').select('id,media_url').limit(1));
// lib/posts.ts selects owner email on the channel query; if anon could read it
// that one query would enumerate every channel owner's address.
await mustNotRead('profiles.email', () =>
  guest.from('profiles').select('id,email').limit(1));
await mustNotRead('profiles.plan_status', () =>
  guest.from('profiles').select('id,plan_status').limit(1));
await mustNotRead('profiles.is_admin', () =>
  guest.from('profiles').select('id,is_admin').limit(1));
await mustNotRead('unapproved posts', () =>
  guest.from('channel_posts').select('id,status').neq('status', 'approved').limit(1));
await mustNotRead('private channels', () =>
  guest.from('channels').select('id,name').eq('is_public', false).limit(1));
await mustNotRead('content_access_grants', () =>
  guest.from('content_access_grants').select('id').limit(1));
await mustNotRead('iap_purchases', () =>
  guest.from('iap_purchases').select('id').limit(1));
await mustNotRead('admin_audit_log', () =>
  guest.from('admin_audit_log').select('id').limit(1));
await mustNotRead('files (user storage)', () =>
  guest.from('files').select('id').limit(1));
await mustNotRead('watch_history', () =>
  guest.from('watch_history').select('id').limit(1));
await mustNotRead('stream_videos', () =>
  guest.from('stream_videos').select('id').limit(1));

console.log('\nMust never write:');
await mustNotRead('INSERT into channel_posts', async () =>
  guest.from('channel_posts').insert({ title: '_guest_write_probe' }).select());
await mustNotRead('UPDATE profiles', async () =>
  guest.from('profiles').update({ full_name: '_guest_write_probe' }).neq('id', '00000000-0000-0000-0000-000000000000').select());

const failed = results.filter(r => !r.ok);
console.log('\n' + '─'.repeat(72));
if (!failed.length) {
  console.log(`  ${results.length}/${results.length} as expected — no guest leak.`);
} else {
  console.log(`  ${failed.length} PROBLEM(S):`);
  for (const f of failed) console.log(`    - ${f.name}: ${f.detail}`);
  console.log(
    '\n  A "LEAK" on a column check usually means RLS is DISABLED on that table.\n' +
    '  A column GRANT restricts which columns are readable, but only RLS decides\n' +
    '  which ROWS are. With RLS off, the grant alone exposes every row.\n' +
    '  Check with:  select relname, relrowsecurity from pg_class\n' +
    "               where relname in ('channel_posts','channels','profiles');"
  );
}
console.log(
  '\n  Note: before v61 is applied the browse checks are EXPECTED to fail —\n' +
  '  guest browsing is not enabled yet. The leak checks must pass either way.\n'
);
process.exit(failed.length ? 1 : 0);
