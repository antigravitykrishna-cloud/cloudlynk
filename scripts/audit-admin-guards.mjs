#!/usr/bin/env node
/**
 * audit-admin-guards — checks that every admin-only RPC re-verifies the caller
 * server-side, in its own body, rather than trusting the screen that called it.
 *
 * Read-only, static. Parses SQL text; contacts no database.
 *
 * Why this matters: the isAdmin checks in app/admin/* are UX only. Every one of
 * these functions is SECURITY DEFINER and GRANTed to `authenticated`, which
 * means any signed-in user can invoke it directly over PostgREST with no app
 * involved. The body is the actual security boundary.
 *
 * A function counts as guarded if its body checks is_admin directly OR
 * delegates to a helper that does (is_owner_or_admin). Counting a delegation as
 * unguarded produces false positives, which is worse than useless — it teaches
 * people to skim past the report.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../supabase/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const files = [
  ...readdirSync(ROOT).filter(f => f.endsWith('.sql')).map(f => [f, join(ROOT, f)]),
  ...readdirSync(join(ROOT, 'migrations')).filter(f => f.endsWith('.sql')).map(f => [f, join(ROOT, 'migrations', f)]),
];

// Parameter lists routinely span lines, so [^)]* silently misses most
// definitions — it matched 6 of 24 before this was fixed. Scan lazily from
// the name to the opening dollar-quote instead.
const FN = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)[\s\S]*?\bas\s+(\$[a-z]*\$)([\s\S]*?)\3/gi;
const defs = new Map();
for (const [name, path] of files) {
  const sql = readFileSync(path, 'utf8');
  for (const m of sql.matchAll(FN)) {
    const fn = m[1].toLowerCase();
    if (!defs.has(fn)) defs.set(fn, []);
    defs.get(fn).push({ file: name, body: m[4], secdef: /security\s+definer/i.test(m[0]) });
  }
}

const GUARD_HELPERS = ['is_owner_or_admin'];

/**
 * Which guard, if any, this body relies on. Plain substring matching rather
 * than a built regex: the helper names are fixed literals, so there is nothing
 * to interpolate, and a template literal here silently turns \b into a
 * backspace character instead of a word boundary.
 */
const guardUsed = (body) => {
  const lower = body.toLowerCase();
  if (/\bis_admin\b/.test(lower)) return 'is_admin';
  return GUARD_HELPERS.find(h => lower.includes(h + '(') || lower.includes(h + ' (')) ?? null;
};

const ADMIN_FNS = [...defs.keys()].filter(n =>
  n.startsWith('admin_') ||
  ['approve_channel_content','reject_channel_content','approve_post','reject_post',
   'delete_channel','update_channel','activate_approved_channels'].includes(n));

let fails = 0;
console.log(`\nADMIN RPC SERVER-SIDE AUTHORIZATION\n${'─'.repeat(78)}`);
console.log(`${'function'.padEnd(38)} ${'defs'.padEnd(5)} ${'secdef'.padEnd(7)} guard`);
console.log('─'.repeat(78));
for (const fn of ADMIN_FNS.sort()) {
  const all = defs.get(fn);
  const latest = all[all.length - 1];        // later file wins at apply time
  const via = guardUsed(latest.body);
  const ok = via !== null;
  if (!ok) fails++;
  console.log(`${fn.padEnd(38)} ${String(all.length).padEnd(5)} ${(latest.secdef ? 'yes' : 'NO').padEnd(7)} ${ok ? via : '*** NONE ***'}`);
}
console.log('─'.repeat(78));
console.log(fails === 0
  ? `All ${ADMIN_FNS.length} admin RPCs re-verify the caller in their own body.\n`
  : `${fails} of ${ADMIN_FNS.length} admin RPCs do NOT self-verify. Fix before release.\n`);
process.exit(fails === 0 ? 0 : 1);
