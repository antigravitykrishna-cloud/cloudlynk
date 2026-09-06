#!/usr/bin/env node
/**
 * audit-schema-sources — static inventory of every schema object this
 * repository defines, and where it is defined.
 *
 * Read-only. Touches no database. It parses SQL text, so it is an inventory of
 * INTENT (what the repo says the schema should be), not of REALITY (what the
 * production database actually contains). The gap between those two is the
 * whole point of the audit, and closing it needs a live introspection pass that
 * this script deliberately does not attempt.
 *
 * Three sources, in the order they were historically applied:
 *   1. supabase/schema.sql              the original hand-run Jollify schema
 *   2. supabase/migration_v*.sql        loose files, run by hand in the
 *                                       dashboard SQL editor, never in the CLI
 *                                       migration chain
 *   3. supabase/migrations/*.sql        the actual CLI migration chain (v40+)
 *
 * Only (3) replays under `supabase db reset`. Everything in (1) and (2) exists
 * in production but is invisible to the CLI.
 *
 * Usage: node scripts/audit-schema-sources.mjs [--json]
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../supabase/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// ── collect sources in historical order ──────────────────────────────────
function looseOrder(name) {
  // migration_v21_... -> 21 ; migration_v39b_... -> 39.5
  const m = name.match(/migration_v(\d+)([a-z]?)/i);
  if (!m) return 9999;
  return parseInt(m[1], 10) + (m[2] ? 0.5 : 0);
}

const rootFiles = readdirSync(ROOT).filter(f => f.endsWith('.sql'));
const sources = [];

if (rootFiles.includes('schema.sql')) {
  sources.push({ tier: 'schema.sql', file: 'schema.sql', path: join(ROOT, 'schema.sql'), order: 0 });
}
for (const f of rootFiles.filter(f => /^migration_v/i.test(f)).sort((a, b) => looseOrder(a) - looseOrder(b))) {
  sources.push({ tier: 'loose', file: f, path: join(ROOT, f), order: looseOrder(f) });
}
for (const f of rootFiles.filter(f => /^\d{14}_/.test(f))) {
  // A migration-named file sitting in the ROOT rather than migrations/ — a
  // duplicate that does NOT replay. Flagged, not counted as chain coverage.
  sources.push({ tier: 'stray', file: f, path: join(ROOT, f), order: 40 });
}
for (const f of readdirSync(join(ROOT, 'migrations')).filter(f => f.endsWith('.sql')).sort()) {
  sources.push({ tier: 'chain', file: f, path: join(ROOT, 'migrations', f), order: 1000 });
}

// ── parse ────────────────────────────────────────────────────────────────
// Deliberately conservative regexes. A false negative (an object we miss) is
// safer here than a false positive, because the output drives a decision about
// what still needs live introspection — over-reporting coverage would hide gaps.
const PATTERNS = [
  ['table',    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi],
  ['view',     /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi],
  ['function', /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi],
  ['trigger',  /create\s+(?:or\s+replace\s+)?trigger\s+([a-z_][a-z0-9_]*)/gi],
  ['index',    /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi],
  ['policy',   /create\s+policy\s+"?([a-z_][a-z0-9_ \-]*?)"?\s+on/gi],
  ['type',     /create\s+type\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi],
  ['bucket',   /insert\s+into\s+storage\.buckets[^;]*?values\s*\(\s*'([a-z0-9-]+)'/gi],
];
const DROPS = [
  ['table',    /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi],
  ['function', /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi],
  ['policy',   /drop\s+policy\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_ \-]*?)"?\s+on/gi],
];

/** Strip -- line comments and block comments so commented-out DDL isn't counted. */
function decomment(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

const objects = new Map(); // "kind:name" -> { kind, name, created: [], dropped: [], altered: [] }
function touch(kind, name) {
  const key = `${kind}:${name.toLowerCase().trim()}`;
  if (!objects.has(key)) objects.set(key, { kind, name: name.trim(), created: [], dropped: [], altered: [] });
  return objects.get(key);
}

for (const src of sources) {
  const sql = decomment(readFileSync(src.path, 'utf8'));
  for (const [kind, re] of PATTERNS) {
    for (const m of sql.matchAll(re)) touch(kind, m[1]).created.push(src);
  }
  for (const [kind, re] of DROPS) {
    for (const m of sql.matchAll(re)) touch(kind, m[1]).dropped.push(src);
  }
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    touch('table', m[1]).altered.push(src);
  }
}

// ── classify ─────────────────────────────────────────────────────────────
const inChain = o => o.created.some(s => s.tier === 'chain');
const inLoose = o => o.created.some(s => s.tier === 'loose' || s.tier === 'schema.sql');
const inStray = o => o.created.some(s => s.tier === 'stray');

const buckets = {
  COMPLETE: [],            // created in the CLI chain — replays from zero
  MISSING_FROM_MIGRATIONS: [], // exists in prod (defined in loose SQL) but chain never creates it
  DUPLICATED: [],          // created in more than one tier
  CONFLICTING: [],         // created in one place, dropped in another, or redefined across tiers
  PRODUCTION_ONLY: [],     // referenced/altered but never created anywhere in the repo
};

for (const o of objects.values()) {
  const createdSomewhere = o.created.length > 0;

  if (!createdSomewhere && o.altered.length > 0) {
    buckets.PRODUCTION_ONLY.push(o);
    continue;
  }
  if (!createdSomewhere) continue;

  const tiers = new Set(o.created.map(s => s.tier));
  if (tiers.size > 1 || o.created.length > 1) {
    // More than one definition. Whether that is benign (idempotent CREATE OR
    // REPLACE of a function, re-run on purpose) or a conflict (two different
    // definitions of the same table) cannot be told from names alone.
    if (o.kind === 'function' || o.kind === 'policy' || o.kind === 'trigger') {
      buckets.DUPLICATED.push(o);
    } else {
      buckets.CONFLICTING.push(o);
    }
  }
  if (o.dropped.length > 0 && o.created.length > 0) {
    if (!buckets.CONFLICTING.includes(o)) buckets.CONFLICTING.push(o);
  }
  if (inChain(o)) {
    buckets.COMPLETE.push(o);
  } else if (inLoose(o) || inStray(o)) {
    buckets.MISSING_FROM_MIGRATIONS.push(o);
  }
}

// ── report ───────────────────────────────────────────────────────────────
if (process.argv.includes('--json')) {
  const plain = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [
    k, v.map(o => ({ kind: o.kind, name: o.name, created: o.created.map(s => s.file), dropped: o.dropped.map(s => s.file) })),
  ]));
  console.log(JSON.stringify(plain, null, 2));
  process.exit(0);
}

const byKind = list => {
  const g = {};
  for (const o of list) (g[o.kind] ??= []).push(o.name);
  return g;
};

console.log('\nCLOUDLYNK — SCHEMA SOURCE INVENTORY (static, no database touched)\n');
console.log(`Sources parsed:`);
for (const tier of ['schema.sql', 'loose', 'stray', 'chain']) {
  const n = sources.filter(s => s.tier === tier).length;
  if (n) console.log(`  ${tier.padEnd(12)} ${n} file(s)`);
}
console.log(`  ${'TOTAL'.padEnd(12)} ${sources.length} files, ${objects.size} distinct objects\n`);

for (const [label, list] of Object.entries(buckets)) {
  console.log(`${'─'.repeat(72)}`);
  console.log(`${label}  (${list.length})`);
  console.log(`${'─'.repeat(72)}`);
  if (!list.length) { console.log('  (none)\n'); continue; }
  const g = byKind(list);
  for (const kind of Object.keys(g).sort()) {
    console.log(`  ${kind}s (${g[kind].length}):`);
    for (const name of g[kind].sort()) {
      const o = list.find(x => x.name === name && x.kind === kind);
      const where = [...new Set(o.created.map(s => s.tier))].join('+') || 'nowhere';
      console.log(`    ${name.padEnd(42)} ${where}`);
    }
  }
  console.log('');
}

console.log('─'.repeat(72));
console.log('WHAT THIS CANNOT TELL YOU');
console.log('─'.repeat(72));
console.log(`
This is the repository's INTENT. It cannot see production. Specifically it
cannot tell you:

  * whether an object listed as COMPLETE actually matches production, or has
    since been edited in the dashboard
  * whether production holds objects that appear in NO file here at all — the
    true PRODUCTION-ONLY set, which by definition leaves no trace in the repo
  * column-level drift: a default changed, a CHECK widened, a NOT NULL dropped
  * RLS enabled/disabled state, and grants
  * anything in the auth, storage or realtime schemas

Closing those needs one read-only introspection pass against the live project,
which needs the database password. See supabase/BASELINE.md.
`);
