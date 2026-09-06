#!/usr/bin/env node
/**
 * audit-apk — forensic check of a built APK or AAB.
 *
 * Reads the artifact itself rather than the config that was meant to produce
 * it. Written because HANDOVER.md asserted the v0.7.0 APK was debug-signed and
 * it was not — its certificate reads CN=Cloudlynk, O=Cloudlynk, C=IN, which is
 * not this project's debug key. A filename says nothing; the signing block
 * does.
 *
 * Needs no JDK and no Android SDK — no apksigner, no keytool, no aapt. It
 * parses the ZIP container, the APK Signing Block, and the DER of the signer
 * certificate directly.
 *
 * Usage:
 *   node scripts/audit-apk.mjs android/app/build/outputs/apk/release/app-release.apk
 *   node scripts/audit-apk.mjs path/to/app-release.aab
 *
 * Exit 0 = every check passed. Exit 1 = at least one FAIL.
 */

import { readFileSync, existsSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('Usage: node scripts/audit-apk.mjs <path to .apk or .aab>');
  process.exit(2);
}

const EXPECTED = {
  packageName: 'com.cloudlynk.app',
  versionName: '0.7.1',
  versionCode: '8',
  minTargetSdk: 36,
  // The debug key this project would fall back to. Seeing it is a hard FAIL.
  debugCertCN: 'Android Debug',
};

const buf = readFileSync(file);
const isAab = file.toLowerCase().endsWith('.aab');
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  const tag = pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${name.padEnd(34)} ${detail}`);
};

console.log(`\nFORENSIC AUDIT — ${file}`);
console.log(`  ${(buf.length / 1024 / 1024).toFixed(1)} MB, ${isAab ? 'Android App Bundle' : 'APK'}\n`);

// ── signing ──────────────────────────────────────────────────────────────
// An AAB is signed with a JAR signature (META-INF/*.RSA), an APK with the
// v2+ APK Signing Block. Handle both.
function derRdns(region) {
  const OIDS = {
    '550403': 'CN', '55040a': 'O', '55040b': 'OU',
    '550407': 'L', '550408': 'ST', '550406': 'C',
  };
  const out = [];
  for (const [hex, label] of Object.entries(OIDS)) {
    const needle = Buffer.from('0603' + hex, 'hex');
    let idx = 0;
    for (;;) {
      const i = region.indexOf(needle, idx);
      if (i === -1) break;
      const j = i + 5;
      const tag = region[j];
      // UTF8String / PrintableString / IA5String / T61String
      if ([0x0c, 0x13, 0x16, 0x14].includes(tag)) {
        const len = region[j + 1];
        out.push([label, region.slice(j + 2, j + 2 + len).toString('utf8')]);
      }
      idx = i + 1;
    }
  }
  return out;
}

let rdns = [];
let sigScheme = 'none found';
const magic = buf.indexOf(Buffer.from('APK Sig Block 42'));
if (magic !== -1) {
  const sizeAtEnd = buf.readBigUInt64LE(magic - 8);
  const start = magic + 16 - 8 - Number(sizeAtEnd);
  rdns = derRdns(buf.subarray(start, magic));
  sigScheme = 'APK Signing Block (v2/v3)';
} else {
  // AAB / v1: the certificate is a PKCS#7 blob in META-INF/*.RSA|DSA|EC, and in
  // an AAB that entry is DEFLATED — scanning the raw file finds nothing and
  // reports an unsigned bundle that is in fact signed. Inflate it first.
  for (const e of zipEntries(buf)) {
    if (!/^META-INF\/.*\.(RSA|DSA|EC)$/i.test(e.name)) continue;
    try {
      const lh = e.localOff;
      if (buf.readUInt32LE(lh) !== 0x04034b50) continue;
      const method = buf.readUInt16LE(lh + 8);
      const nameLen = buf.readUInt16LE(lh + 26);
      const extraLen = buf.readUInt16LE(lh + 28);
      const start = lh + 30 + nameLen + extraLen;
      const raw = buf.subarray(start, start + e.compSize);
      rdns = derRdns(method === 8 ? inflateRawSync(raw) : raw);
      if (rdns.length) { sigScheme = `JAR signature (v1) — ${e.name}`; break; }
    } catch { /* try the next candidate */ }
  }
  // Fall back to the raw scan for a stored (uncompressed) signature.
  if (!rdns.length) {
    rdns = derRdns(buf);
    if (rdns.length) sigScheme = 'JAR signature (v1)';
  }
}

const uniq = [...new Map(rdns.map(([k, v]) => [`${k}=${v}`, [k, v]])).values()];
const cn = uniq.find(([k]) => k === 'CN')?.[1] ?? null;
const subject = uniq.map(([k, v]) => `${k}=${v}`).join(', ');

check('Signed', uniq.length > 0, uniq.length ? sigScheme : 'NO SIGNATURE FOUND');
check('Certificate subject', !!cn, subject || '(none)');
check(
  'Not debug-signed',
  cn !== null && cn !== EXPECTED.debugCertCN,
  cn === EXPECTED.debugCertCN
    ? 'DEBUG KEY — Play will reject this'
    : `CN=${cn ?? '?'}`
);

// ── manifest / identity ──────────────────────────────────────────────────
// AndroidManifest.xml inside an APK is binary XML (AXML). Rather than write an
// AXML parser, pull the UTF-16 string pool, which holds every literal.
function stringsUtf16(b) {
  const out = [];
  let cur = [];
  for (let i = 0; i + 1 < b.length; i += 2) {
    const c = b.readUInt16LE(i);
    if (c >= 0x20 && c < 0x7f) cur.push(String.fromCharCode(c));
    else {
      if (cur.length >= 4) out.push(cur.join(''));
      cur = [];
    }
  }
  if (cur.length >= 4) out.push(cur.join(''));
  return out;
}

const hay = buf.toString('latin1');

// ── entry index, so a finding can say WHERE it is ────────────────────────
//
// Attribution is the difference between a useful report and a nagging one. On
// the v0.7.0 APK, "jollify" matched inside lib/*/libreact_codegen_rnscreens.so
// — the previous developer's build path (D:\Joliffy\jollify\...) baked into
// native debug info by the compiler. That is worth knowing and is nothing like
// the same string appearing in the JS bundle, which would mean the app still
// calls itself Jollify. A whole-file boolean cannot tell those apart.
function zipEntries(b) {
  // Walk the central directory backwards from the EOCD record.
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd === -1) return [];
  let off = b.readUInt32LE(eocd + 16);
  const count = b.readUInt16LE(eocd + 10);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (b.readUInt32LE(off) !== 0x02014b50) break;
    const nameLen = b.readUInt16LE(off + 28);
    const extraLen = b.readUInt16LE(off + 30);
    const cmtLen = b.readUInt16LE(off + 32);
    const localOff = b.readUInt32LE(off + 42);
    const compSize = b.readUInt32LE(off + 20);
    out.push({
      name: b.slice(off + 46, off + 46 + nameLen).toString('utf8'),
      localOff, compSize,
    });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

const entries = zipEntries(buf);

/**
 * Inflate the entries worth searching, so content checks work on an AAB.
 *
 * An APK stores its JS bundle and native libs uncompressed, so scanning the
 * raw file happened to work. An AAB deflates everything — which made the first
 * AAB audit report "no Supabase URL found" and "package name FAIL" on a bundle
 * that contained both, and match "1TB" inside a debug-symbols file. A checker
 * that is wrong on the artifact you actually upload to Play is worse than none.
 *
 * Debug-symbol entries are skipped deliberately: BUNDLE-METADATA/...debugsymbols
 * holds compiler symbol names, and matching product strings against them is
 * pure noise.
 */
function searchableEntries() {
  const out = [];
  for (const e of entries) {
    if (/debugsymbols|\.sym$/i.test(e.name)) continue;
    try {
      const lh = e.localOff;
      if (buf.readUInt32LE(lh) !== 0x04034b50) continue;
      const method = buf.readUInt16LE(lh + 8);
      const nameLen = buf.readUInt16LE(lh + 26);
      const extraLen = buf.readUInt16LE(lh + 28);
      const dataStart = lh + 30 + nameLen + extraLen;
      const raw = buf.subarray(dataStart, dataStart + e.compSize);
      const body = method === 8 ? inflateRawSync(raw) : raw;
      // Two views of the same bytes. Hermes stores any string containing a
      // non-ASCII character as UTF-16, so a latin1 scan cannot see it — a
      // secret with one accented character or an em dash in it would pass
      // every leak check below while sitting in plain sight. Stripping the
      // interleaved NULs gives a second searchable view.
      const latin1 = body.toString('latin1');
      const utf16 = body.length > 1
        ? Buffer.from(body.filter((_, i) => i % 2 === 0)).toString('latin1')
        : '';
      out.push({ name: e.name, text: latin1 + ' ' + utf16 });
    } catch {
      // A corrupt or unsupported entry is not worth failing the whole audit
      // over; it just is not searched.
    }
  }
  return out;
}

const searchable = isAab ? searchableEntries() : [];

/** Which zip entries a byte offset falls inside. Approximate but sufficient. */
function entryAt(offset) {
  let best = null;
  for (const e of entries) {
    if (offset >= e.localOff && offset <= e.localOff + e.compSize + 512) {
      if (!best || e.localOff > best.localOff) best = e;
    }
  }
  return best?.name ?? '(unattributed)';
}

// ── leakage checks ───────────────────────────────────────────────────────
//
// Split by consequence. A `fail` match means the app is wrong. A `warn` match
// means something to look at that is routinely benign — flagging those as
// failures trains people to ignore the whole report.
const CHECKS = [
  ['No service-role key',       /SUPABASE_SERVICE_ROLE|service_role_key|SUPABASE_SECRET_KEY/, 'fail'],
  ['No Cloudflare API token',   /CLOUDFLARE_STREAM_API_TOKEN|CLOUDFLARE_R2_SECRET/,           'fail'],
  ['No dev-client',             /expo\/modules\/devlauncher|DevLauncherController/,           'fail'],
  ['No UPI payment flow',       /upi:\/\/pay/,                                                'fail'],
  // Text only, via the 4th element. Applied to dex this matches raw bytecode
  // that happens to spell "1TB" — it fired on five separate dex files in a
  // bundle that makes no storage claim anywhere. A user-visible claim can only
  // live in the JS bundle or in resources, so look only there.
  ['No 2TB/1TB storage claim',  /\b[12]\s?TB\b/,                        'fail', /\.(bundle|json|xml|arsc)$|assets\//],
  ['No Streamly identity',      /streamly/i,                                                  'fail'],
  // Warnings: both fire on things outside the app's own code. React Native
  // ships localhost strings in every release bundle (dev-server paths that are
  // unreachable in release), and a stale build path can survive in native
  // debug info from a dependency compiled elsewhere.
  ['No Jollify identity',       /jollify/i,                                                   'warn'],
  ['No localhost endpoints',    /http:\/\/localhost|127\.0\.0\.1:\d|10\.0\.2\.2/,             'warn'],
];
/**
 * `scope`, when given, restricts the search to entries whose name matches it.
 * Some checks are only meaningful against text: searching compiled dex for a
 * product string matches bytecode by coincidence and reports a defect that
 * does not exist.
 */
function findInArtifact(re, scope) {
  const pool = isAab ? searchable : searchableAll();
  for (const e of pool) {
    if (scope && !scope.test(e.name)) continue;
    const m = e.text.match(re);
    if (m) return { text: m[0], where: e.name };
  }
  return null;
}

// An APK stores much of its content uncompressed, so a raw scan worked — but
// not for dex, where it missed expo-dev-client entirely and produced a
// confident "absent". Inflate both formats the same way.
let _all = null;
function searchableAll() {
  if (_all) return _all;
  _all = searchableEntries();
  return _all;
}

for (const [name, re, severity, scope] of CHECKS) {
  const m = findInArtifact(re, scope);
  if (!m) { check(name, true, 'absent'); continue; }
  const where = m.where;
  const detail = `"${String(m.text).slice(0, 30)}" in ${where}`;
  if (severity === 'warn') {
    results.push({ name, pass: null, detail });
    console.log(`  [WARN] ${name.padEnd(34)} ${detail}`);
  } else {
    check(name, false, detail);
  }
}

// The check that actually matters more than "no localhost": the Supabase URL
// compiled into the bundle must be the production project. A build pointed at
// a branch database looks completely normal until the client's data goes
// somewhere nobody is watching.
// Package name: checked here rather than earlier, because on an AAB it lives
// in a protobuf manifest and a compressed resource table, so it needs the
// inflated view that only exists by this point.
const pkgHit = isAab
  ? searchable.some(e => e.text.includes(EXPECTED.packageName))
  : (hay.includes(EXPECTED.packageName) || stringsUtf16(buf).some(x => x.includes(EXPECTED.packageName)));
check('Package name', pkgHit, EXPECTED.packageName);

const PROD_REF = 'wdtwjiixuueqejfraaod';
const urlRe = /https:\/\/[a-z0-9]{20}\.supabase\.co/g;
const urls = [...new Set(
  isAab ? searchable.flatMap(e => e.text.match(urlRe) ?? [])
        : (hay.match(urlRe) ?? [])
)];
check(
  'Supabase URL is production',
  urls.length === 1 && urls[0].includes(PROD_REF),
  urls.length ? urls.join(', ') : 'no Supabase URL found in the bundle'
);

// ── version / sdk, best effort without aapt ──────────────────────────────
// These live in the AXML resource-map as integers, not strings, so a text scan
// cannot recover them reliably. Report the source-of-truth instead of guessing.
// Comments have to go first. These files explain themselves at length, and an
// earlier version of this matched the prose "versionCode is not strictly
// greater than the last one" and cheerfully reported the versionCode as "is".
const decomment = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

let gradle = '';
try { gradle = decomment(readFileSync('android/app/build.gradle', 'utf8')); } catch {}
// Line-anchored, so it can only match a real assignment.
const gv = (k) => (gradle.match(new RegExp(`^\\s*${k}\\s+["']?([\\w.]+)["']?`, 'm')) ?? [])[1];
let rootGradle = '';
try { rootGradle = decomment(readFileSync('android/build.gradle', 'utf8')); } catch {}
const target = (rootGradle.match(/^\s*targetSdkVersion\s*=\s*(\d+)/m) ?? [])[1];

check('versionName (from source)', gv('versionName') === EXPECTED.versionName, String(gv('versionName')));
check('versionCode (from source)', gv('versionCode') === EXPECTED.versionCode, String(gv('versionCode')));
check(
  'targetSdk >= 36 (from source)',
  target !== undefined && Number(target) >= EXPECTED.minTargetSdk,
  String(target)
);

// ── summary ──────────────────────────────────────────────────────────────
const failed = results.filter(r => r.pass === false);
console.log('\n' + '─'.repeat(64));
if (failed.length === 0) {
  console.log(`  ${results.length}/${results.length} checks PASSED`);
} else {
  console.log(`  ${failed.length} FAILED of ${results.length}:`);
  for (const f of failed) console.log(`    - ${f.name}: ${f.detail}`);
}
console.log(
  '\n  Note: versionName, versionCode and targetSdk are read from\n' +
  '  android/build.gradle and android/app/build.gradle, not decoded from the\n' +
  '  binary manifest — they live there as integers in the resource map, and a\n' +
  '  wrong guess is worse than an honest source. To confirm them in the\n' +
  '  artifact itself once you have the SDK:\n' +
  '    %ANDROID_HOME%\\build-tools\\36.0.0\\aapt2 dump badging <apk>\n'
);
process.exit(failed.length ? 1 : 0);
