# Database reproducibility audit — 2026-09-06

Read-only. **No production database was contacted and nothing was modified.**

Reproduce with `node scripts/audit-schema-sources.mjs` (add `--json` for machine
output).

---

## Scope and a hard limit up front

This audit answers "what does the repository define, and what of that replays?"
It cannot answer "what does production actually contain?" — that needs a
read-only introspection pass against the live project, which needs the database
password. That credential was **not** in the handover archive: `.env` carries
`SUPABASE_SECRET_KEY`, which is a PostgREST credential and cannot drive
`pg_dump` or read `pg_policies`.

So section 5 (PRODUCTION-ONLY) is necessarily empty here, and the COMPLETE list
below means "created by a migration that replays", **not** "verified to match
production". Both gaps close with one command once the password exists —
see §7.

---

## 1. What sources exist

The repository holds **three tiers** of schema definition. Only one of them
replays under `supabase db reset`.

| Tier | Files | Replays? | What it is |
|---|---:|---|---|
| `supabase/schema.sql` | 1 | **No** | The original Jollify schema, run by hand in the SQL editor |
| `supabase/migration_v*.sql` | 36 | **No** | v2–v39b, run by hand in the dashboard, never added to the CLI chain |
| `supabase/20260622110000_*.sql` | 1 | **No** | A migration-named file sitting in the wrong directory |
| `supabase/migrations/*.sql` | 18 | **Yes** | The actual CLI chain, v40–v57 |

**56 files, 200 distinct objects.**

This corrects the handover's framing. It said the history was lost to dashboard
clicks. It is not lost — it is *present but unwired*. 37 of the 39 pre-v40 files
are sitting in `supabase/` one directory above where the CLI looks. That is a
much better starting position than "reconstruct from nothing", and it changes
the recommended fix (§7).

Numbering gaps: **v1, v3, v6, v13 have no file.** Whatever they did exists only
in production.

---

## 2. COMPLETE — 79 objects

Created by the CLI chain, so they replay from zero.

- **8 tables** — `admin_audit_log`, `content_access_grants`, `iap_purchases`,
  `stream_videos`, `subtitles`, `upload_rate_limit_log`, `user_blocks`,
  `user_preferences`
- **32 functions** — the whole v55/v56/v57 admin surface
  (`admin_grant_content_access`, `admin_search_users`, `has_content_access`,
  `admin_set_signed_lock`, …)
- **23 policies**, **12 indexes**, **3 triggers**, **1 bucket**

Everything built from v40 onward is properly in the chain. The discipline is
recent and it is good; the debt is all older.

---

## 3. MISSING FROM MIGRATIONS — 116 objects

Defined in `schema.sql` or the loose files, therefore **live in production and
absent from the replayable chain**. This is the actual finding.

### The 12 tables — this is the core of the application

| Table | Defined in |
|---|---|
| `profiles` | `schema.sql` |
| `channels` | `schema.sql` |
| `channel_members` | `schema.sql` |
| `files` | `schema.sql` |
| `transfers` | `schema.sql` |
| `content_reports` | `schema.sql` |
| `channel_posts` | `migration_v2.sql` |
| `channel_videos` | `migration_v18_channel_videos.sql` |
| `watch_history` | `migration_v15_watch_history.sql` |
| `subscription_plans` | `migration_v20_subscription_plans.sql` |
| `subscription_requests` | `migration_v21_subscription_state_machine.sql` |
| `app_settings` | loose |

`app_settings` is the one the handover named — it is the table v40 assumes and
whose absence stops `supabase start`. It is one of twelve, not the problem
itself.

### Also missing

- **17 functions**, including `join_channel`, `leave_channel`,
  `can_post_to_channel`, `export_my_data`, `delete_channel`,
  `admin_list_pending_content` — all of which the app calls today
- **62 policies** — more than half of the app's entire RLS surface, including
  every policy on `channel_videos`, `watch_history`, `subscription_*`, and the
  original `profiles`/`channels`/`files` policies
- **21 indexes**, **3 triggers** (`on_auth_user_created` among them — the
  trigger that creates a profile row on signup), **1 bucket**
  (`channel-media`)

---

## 4. DUPLICATED — 17 objects

Defined in more than one tier. For functions this is mostly benign — `CREATE OR
REPLACE` re-run deliberately as behaviour changed — but it means **the repo
contains several different versions of the same function and does not say which
one production is running.**

Worst offenders, by number of competing definitions:

| Object | Defined in |
|---|---|
| `handle_new_user` | `schema.sql` + loose + stray + chain (**4**) |
| `activate_approved_channels` | `schema.sql` + stray + chain |
| `increment_storage_used` | `schema.sql` + loose + chain |
| `handle_updated_at` | `schema.sql` + stray + chain |
| `increment_channel_members` | `schema.sql` + stray + chain |
| `approve_channel_content`, `reject_channel_content`, `record_post_view`, `update_channel_post_count` | loose + stray + chain |

`handle_new_user` matters most: it is the signup trigger, and the handover has
an open unexplained bug about `terms_accepted_at` not being written during
signup. Four candidate definitions is a plausible contributing factor and is
worth checking against production directly.

---

## 5. CONFLICTING — 39 flagged, most are benign

**Read this bucket sceptically.** The detector flags any object created in one
place and dropped in another, which is exactly what healthy policy evolution
looks like. `channel_posts_select_v52 → v56 → v57` is correct migration
practice, not a conflict, and it is in this list.

The genuine conflicts, after review:

- **`user-files` bucket** — created in `schema.sql` *and* re-created in the
  chain. Two definitions of one bucket; the storage-level settings (public
  flag, size limits, MIME allow-list) may differ between them.
- **`approve_subscription_request` / `reject_subscription_request`** — created
  in the loose files, dropped by v57. Correct outcome, but it means v57 drops
  something the replayable chain never created. **v57 is written with
  `DROP … IF EXISTS` and an `information_schema` guard, so it applies cleanly
  either way.** This was deliberate.
- **`profiles` policy overlap** — `Users can update own profile` exists in both
  `schema.sql` and the chain. Overlapping policies on the same table `OR`
  together and widen access. This one needs a live check.

---

## 6. PRODUCTION-ONLY — cannot be determined statically

Zero found, and that number is meaningless: an object that exists only in
production leaves no trace in the repository by definition. The four missing
version numbers (v1, v3, v6, v13) plus any dashboard edit made since guarantee
this set is **not** empty in reality.

This is the single largest unknown and the reason §7 step 1 is an introspection
pass rather than a code change.

---

## 7. Can `schema.sql` be the baseline? — No.

Direct answer to the question, because it is tempting and it would be wrong.

`schema.sql` is **290 lines, 6 tables, and v1-era**. It has since diverged in a
way that is not additive:

```sql
-- schema.sql line 22, as it stands today:
plan text not null default 'free' check (plan in ('free', 'pro', 'enterprise'))
```

Production has no such column. It has `plan_status`, introduced in
`migration_v21`, constrained to `('free','active','expired','cancelled','lifetime')`,
and every entitlement check in the app and in v46/v48/v50/v57 reads *that*.
`schema.sql` also predates `channel_posts` entirely.

Applying it as a baseline would produce a database with a `plan` column nothing
reads, no `plan_status`, and no `channel_posts` — on top of which v40–v57 would
fail. It is a historical artifact, not a baseline.

### The recommended plan — safe, staged, nothing applied to production

**Step 1 — introspect (read-only, needs the DB password).**
```bash
npx supabase login
npx supabase link --project-ref <CONFIRM THIS REF WITH THE OWNER>
npx supabase db dump --linked -f /tmp/prod_public.sql            # schema only
npx supabase db dump --linked --schema storage -f /tmp/prod_storage.sql
```
`db dump` is `pg_dump --schema-only` underneath. It reads; it writes nothing.
This is what turns §6 from a guess into a list.

**Step 2 — diff intent against reality.**
```bash
node scripts/audit-schema-sources.mjs --json > /tmp/repo_intent.json
```
Compare the dump's object list against `COMPLETE ∪ MISSING_FROM_MIGRATIONS`.
Anything in the dump and in neither is the true PRODUCTION-ONLY set. Anything
in the repo and not in the dump is dead code that can be dropped from the plan.

**Step 3 — generate the baseline from the dump, not by hand.**
The dump *is* the baseline. Save it as
`supabase/migrations/20260101000000_v00_baseline.sql` — the timestamp sorts
before v40, so v40–v57 replay on top of it. Then:
- strip the `auth`, `storage`, `realtime`, `extensions` and `graphql` schema
  bodies that `pg_dump` emits (the local stack creates those itself and will
  collide)
- append the bucket rows from the storage dump, minus `payment-screenshots`
  write policies, which v57 deliberately removed
- do **not** hand-edit table definitions to "tidy" them; drift in a baseline is
  worse than no baseline, because it produces a local database that behaves
  differently from production while looking authoritative

**Step 4 — prove it replays.** This is the only step that proves anything.
```bash
npx supabase start
npx supabase db reset      # baseline + v40..v57 from zero
```

**Step 5 — prove it matches.**
```bash
npx supabase db diff --linked --schema public
```
Empty output means baseline + chain reproduces production exactly. Non-empty
output is the drift list — fix the baseline, never the production database.

**Step 6 — retire the loose files without deleting them.**
`git mv supabase/migration_v*.sql supabase/schema.sql supabase/history/`, with a
README saying they are the pre-baseline record, superseded by the generated
baseline, kept for provenance. **Do not delete them** — they are the only
written record of why several production objects look the way they do, and
`handle_new_user` in particular has four versions worth keeping side by side.

### What must not happen

- No `db push` and no dashboard DDL until step 5 passes.
- No rewriting of v40–v57. They are correct and they replay; the baseline goes
  *underneath* them.
- No treating dashboard-created objects as disposable. 116 of them are load
  bearing, including every policy on `watch_history` and `channel_videos`.

---

## 8. Risk if this is not done before launch

Running Meta ads at an app whose schema is not reproducible means:

- a bad migration cannot be rehearsed, only discovered in production under load
- there is no rollback target — `db reset` would destroy, not restore
- the 62 uncaptured RLS policies are the app's entire access-control surface for
  `channel_videos`, `watch_history` and `subscription_*`; nobody can review what
  is not written down, and this audit already found two real RLS holes in the
  parts that *were* written down

Step 1 is one read-only command. It needs one credential.
