#!/usr/bin/env node
/**
 * Project-specific guards.
 *
 * Every check here is a bug that actually shipped, or nearly did. They exist
 * because `tsc` cannot catch any of them: each one typechecks perfectly and is
 * wrong only at runtime. Removing a check is fine once the class of bug is
 * genuinely impossible — not because it happens to be failing.
 *
 * Run: node scripts/guards.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const failures = [];
const notes = [];

/** Opt out on a call site that is genuinely authenticated-only. */
const ALLOW = 'guards-allow-select-star';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'android' || entry === 'ios') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const sources = walk(ROOT).filter(f => {
  const r = relative(ROOT, f).replace(/\\/g, '/');
  return r.startsWith('app/') || r.startsWith('lib/') || r.startsWith('hooks/') || r.startsWith('components/');
});

/**
 * Strip comments before matching.
 *
 * The first run of this script flagged a comment that *described* the bug it
 * was looking for. A guard that fires on its own documentation teaches people
 * to pass --no-verify, so accuracy is not a nicety here.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:])\/\/[^\n]*/g, '$1');
}

const rel = f => relative(ROOT, f).replace(/\\/g, '/');
function fail(check, detail) { failures.push(`${check}\n    ${detail}`); }

// ─── 1. The dead `plan` column ──────────────────────────────────────────────
// profiles.plan was superseded by plan_status in v48 and nothing has written
// it since, so it reads 'free' for paying customers. It produced two live
// bugs: subscribers locked out of channels they had paid for, and subscribers
// shown the upgrade prompt. Reading it is always a mistake.
for (const f of sources) {
  if (/(?:profile|profiles)\??\.plan\b(?!_)/.test(code(readFileSync(f, 'utf8')))) {
    fail('Reads the dead `profiles.plan` column',
      `${rel(f)} — use plan_status via useAuth's isPaidUser / planStatus.`);
  }
}

// ─── 2. select('*') on partially-granted tables ─────────────────────────────
// `anon` holds column-level SELECT on a subset of channels and channel_posts.
// PostgREST fails the WHOLE request when a caller asks for a column it cannot
// read, so select('*') returns nothing at all for a guest rather than a
// partial row — and the caller's catch renders that as "empty". That is
// exactly how the Channels tab showed "No channels yet" over eight visible
// channels.
//
// Authenticated-only call sites are safe; annotate them with the ALLOW marker
// rather than widening the check.
const RESTRICTED = ['channels', 'channel_posts'];
for (const f of sources) {
  const raw = readFileSync(f, 'utf8');
  if (raw.includes(ALLOW)) continue;
  const src = code(raw);
  for (const table of RESTRICTED) {
    const re = new RegExp(`from\\(['"\`]${table}['"\`]\\)\\s*\\r?\\n?\\s*\\.select\\(\\s*['"\`]\\*`);
    if (re.test(src)) {
      fail(`select('*') on \`${table}\``,
        `${rel(f)} — name the columns, or add "${ALLOW}" if this path is authenticated-only.`);
    }
  }
}

// ─── 3. Reanimated's babel plugin ───────────────────────────────────────────
// Without it worklets silently do not run: animations stop and nothing errors.
if (existsSync(join(ROOT, 'babel.config.js'))) {
  const babel = readFileSync(join(ROOT, 'babel.config.js'), 'utf8');
  const used = sources.some(f => readFileSync(f, 'utf8').includes('react-native-reanimated'));
  if (used && !babel.includes('react-native-reanimated/plugin')) {
    fail('reanimated is imported but its babel plugin is missing',
      'babel.config.js — worklets will not run, and nothing will report an error.');
  }
}

// ─── 4. Release readiness (informational, never fatal) ──────────────────────
// `noop` is correct until the Play Console products exist. But shipping it
// means every purchase returns "not available yet", so it must not be a
// surprise at submission time.
if (existsSync(join(ROOT, 'app.json'))) {
  const extra = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))?.expo?.extra ?? {};
  if (extra.IAP_PROVIDER === 'noop') {
    notes.push('IAP_PROVIDER is "noop" — purchases fail with "not available yet". Set "google_play" once the Play products are Activated.');
  }
  if (String(extra.ADMOB_APP_ID ?? '').includes('3940256099942544')) {
    notes.push('ADMOB_APP_ID is still a Google TEST unit id. Replace it or drop the ads dependency before release.');
  }
}

for (const n of notes) console.log(`note: ${n}`);
if (failures.length) {
  console.error(`\n${failures.length} guard failure(s):\n`);
  for (const f of failures) console.error(`  x ${f}\n`);
  process.exit(1);
}
console.log(`\nguards passed (${sources.length} source files checked)`);
