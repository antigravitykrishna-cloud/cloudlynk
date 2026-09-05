#!/usr/bin/env node
/**
 * verify-stream-access — proves, over real HTTP with real user JWTs, that the
 * stream-playback-token edge function hands out playback URLs to exactly the
 * people who should get them.
 *
 * This is the check the handover lists as open item 1: entitlement was proven
 * at the database input the function reads, but the function itself was never
 * invoked over HTTP by a real user. Feed visibility was proven; the playback
 * half was not. This closes that.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS WRITES TO WHATEVER DATABASE YOU POINT IT AT.
 *
 * There is no local Supabase to point it at (the migrations cannot build one
 * from scratch — see SUPABASE_BASELINE.md), so in practice that means
 * production. It creates throwaway auth users, a throwaway channel and two
 * throwaway posts, exercises them, and deletes all of it in a finally block.
 *
 * It refuses to run without --yes-write-to-production so that nobody does
 * this by reflex.
 *
 * Nothing it creates is visible to real users: the channel is created
 * is_public=false, and every object it makes is prefixed `_authtest_`.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   node scripts/verify-stream-access.mjs --yes-write-to-production
 *   node scripts/verify-stream-access.mjs --yes-write-to-production --keep
 *
 *   --keep   leave the fixtures behind for manual inspection. You must then
 *            delete them yourself; the script prints their ids.
 *
 * Reads from .env (never printed):
 *   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY
 *
 * Exit code 0 = every case behaved as required. Non-zero = at least one did
 * not, and the summary says which.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// ── env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const out = {};
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // .env absent is fine if the vars are already exported.
  }
  return { ...out, ...process.env };
}

const env = loadEnv();
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SECRET_KEY;

// Names only, never values — this output gets pasted into tickets.
const missing = Object.entries({
  EXPO_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SECRET_KEY: SERVICE_KEY,
}).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error('Missing required environment variables (names only):');
  for (const k of missing) console.error(`  - ${k}`);
  process.exit(2);
}

if (!process.argv.includes('--yes-write-to-production')) {
  console.error(
    'Refusing to run without --yes-write-to-production.\n' +
    `This creates and deletes real rows in ${new URL(SUPABASE_URL).host}.`
  );
  process.exit(2);
}
const KEEP = process.argv.includes('--keep');

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TAG = `_authtest_${Date.now()}`;
const PASSWORD = `Aa1!${randomUUID()}`;
const created = { users: [], channelId: null, postIds: [] };

// ── helpers ──────────────────────────────────────────────────────────────
async function makeUser(label, profilePatch = {}) {
  const email = `${TAG}_${label}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error) throw new Error(`createUser(${label}): ${error.message}`);
  const id = data.user.id;
  created.users.push(id);

  // The handle_new_user trigger creates the profile row; give it a moment,
  // then patch. Retried because trigger timing is not guaranteed.
  let lastErr;
  for (let i = 0; i < 10; i++) {
    const patch = { birth_year: 1990, terms_accepted_at: new Date().toISOString(), ...profilePatch };
    const { error: upErr, count } = await admin
      .from('profiles').update(patch, { count: 'exact' }).eq('id', id);
    if (!upErr && count > 0) return { id, email, label };
    lastErr = upErr;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`profile patch(${label}) never landed: ${lastErr?.message ?? 'no row'}`);
}

/** A real end-user JWT, obtained the way the app obtains one. */
async function signIn(email) {
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return data.session.access_token;
}

/** Calls the deployed function exactly as the client does. */
async function requestToken(jwt, postId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/stream-playback-token`, {
    method: 'POST',
    headers: {
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ postId }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, gotUrl: typeof body?.url === 'string', error: body?.error };
}

// ── the matrix ───────────────────────────────────────────────────────────
const results = [];
function record(name, expect, actual, detail) {
  const pass = expect === actual;
  results.push({ name, expect, actual, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}`);
  console.log(`         expected ${expect ? 'PLAYABLE' : 'DENIED'}, got ${actual ? 'PLAYABLE' : 'DENIED'} (${detail})`);
}

async function main() {
  console.log(`\nstream-playback-token authorization matrix`);
  console.log(`target: ${new URL(SUPABASE_URL).host}`);
  console.log(`fixtures tagged: ${TAG}\n`);

  // ── fixtures ──
  const owner = await makeUser('owner', { is_admin: true });

  const { data: channel, error: chErr } = await admin.from('channels').insert({
    name: `${TAG} channel`,
    owner_id: owner.id,
    is_public: false,   // never surfaces to a real user
    status: 'active',
  }).select('id').single();
  if (chErr) throw new Error(`create channel: ${chErr.message}`);
  created.channelId = channel.id;

  // A UID that does not exist on Cloudflare. Every DENIED case must be
  // rejected before the function ever calls Cloudflare, so a fake UID is
  // enough to prove them. The PLAYABLE cases are asserted as "got past
  // authorization" rather than "got a working URL" — see the note printed
  // at the end.
  const fakeUid = `authtest${Date.now()}`;

  async function makePost(label, patch) {
    const { data, error } = await admin.from('channel_posts').insert({
      channel_id: channel.id,
      author_id: owner.id,
      title: `${TAG} ${label}`,
      status: 'approved',
      access_level: 'premium',
      video_url: fakeUid,
      ...patch,
    }).select('id').single();
    if (error) throw new Error(`create post(${label}): ${error.message}`);
    created.postIds.push(data.id);
    return data.id;
  }

  const premiumPost = await makePost('premium');
  const removedPost = await makePost('removed', { status: 'removed' });

  // Everyone must be a channel member, so membership is never the reason a
  // case fails — this suite is about entitlement, not membership.
  const memberIds = [];
  const users = {
    free: await makeUser('free', { plan_status: 'free' }),
    active: await makeUser('active', { plan_status: 'active', plan_expires_at: new Date(Date.now() + 864e5).toISOString() }),
    expired: await makeUser('expired', { plan_status: 'active', plan_expires_at: new Date(Date.now() - 864e5).toISOString() }),
    granted: await makeUser('granted', { plan_status: 'free' }),
    revoked: await makeUser('revoked', { plan_status: 'free' }),
    banned: await makeUser('banned', { plan_status: 'active', plan_expires_at: new Date(Date.now() + 864e5).toISOString(), account_status: 'banned' }),
  };
  for (const u of [owner, ...Object.values(users)]) memberIds.push({ channel_id: channel.id, user_id: u.id });
  const { error: memErr } = await admin.from('channel_members').insert(memberIds);
  if (memErr) throw new Error(`channel_members: ${memErr.message}`);

  // Grants: one live, one revoked.
  const { error: gErr } = await admin.from('content_access_grants').insert([
    { post_id: premiumPost, user_id: users.granted.id, granted_by: owner.id, status: 'active' },
    { post_id: premiumPost, user_id: users.revoked.id, granted_by: owner.id, status: 'revoked' },
  ]);
  if (gErr) throw new Error(`content_access_grants: ${gErr.message}`);

  console.log('Cases:\n');

  // A 502/500 means authorization PASSED and Cloudflare then refused the
  // fake UID. That is the signal we want for the allowed cases.
  const PASSED_AUTH = new Set([200, 500, 502]);

  for (const [label, expectPlayable, user, postId] of [
    ['active premium subscriber',   true,  users.active,  premiumPost],
    ['free user',                   false, users.free,    premiumPost],
    ['expired premium',             false, users.expired, premiumPost],
    ['explicit grant holder',       true,  users.granted, premiumPost],
    ['revoked grant holder',        false, users.revoked, premiumPost],
    ['banned user with live plan',  false, users.banned,  premiumPost],
    ['removed content',             false, users.active,  removedPost],
  ]) {
    const jwt = await signIn(user.email);
    const r = await requestToken(jwt, postId);
    const playable = PASSED_AUTH.has(r.status);
    record(label, expectPlayable, playable, `HTTP ${r.status}${r.error ? ` "${r.error}"` : ''}`);
  }

  // Unauthenticated — no Authorization header at all.
  const anonRes = await requestToken(null, premiumPost);
  record('unauthenticated request', false, PASSED_AUTH.has(anonRes.status),
    `HTTP ${anonRes.status}${anonRes.error ? ` "${anonRes.error}"` : ''}`);

  return results;
}

async function cleanup() {
  if (KEEP) {
    console.log('\n--keep: fixtures left in place. Delete them yourself:');
    console.log(`  posts:   ${created.postIds.join(', ') || '(none)'}`);
    console.log(`  channel: ${created.channelId ?? '(none)'}`);
    console.log(`  users:   ${created.users.join(', ') || '(none)'}`);
    return;
  }
  // Order matters — children before parents.
  for (const id of created.postIds) {
    await admin.from('content_access_grants').delete().eq('post_id', id);
    await admin.from('channel_posts').delete().eq('id', id);
  }
  if (created.channelId) {
    await admin.from('channel_members').delete().eq('channel_id', created.channelId);
    await admin.from('channels').delete().eq('id', created.channelId);
  }
  for (const id of created.users) {
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  console.error(`\nHarness error (not a test result): ${err.message}`);
  exitCode = 2;
} finally {
  await cleanup().catch(e => console.error(`cleanup failed: ${e.message}`));
}

if (results.length) {
  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} cases behaved as required.`);
  if (failed.length) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  - ${f.name}: expected ${f.expect ? 'PLAYABLE' : 'DENIED'}, got ${f.actual ? 'PLAYABLE' : 'DENIED'} (${f.detail})`);
    exitCode = 1;
  }
  console.log(
    '\nNote on the PLAYABLE cases: fixtures use a Cloudflare UID that does not\n' +
    'exist, so an allowed caller reaches Cloudflare and gets a 5xx there. That\n' +
    'proves authorization let them through, which is what this suite tests. It\n' +
    'does NOT prove the minted URL plays — that needs a real uploaded video and\n' +
    'is the one part of open item 1 this cannot cover unattended.'
  );
}
process.exit(exitCode);
