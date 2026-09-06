# The migrations cannot build this database from scratch

`npx supabase start` fails immediately on a clean checkout. This explains why,
what it costs, and how to fix it properly — which needs one credential that was
not in the handover archive.

## What is actually wrong

The handover describes this as "the first migration (v40) assumes a
dashboard-created `app_settings` table". That is true but understates it. The
real shape:

**Tables that some migration creates — 8:**

```
admin_audit_log        content_access_grants  iap_purchases    stream_videos
subtitles              upload_rate_limit_log  user_blocks      user_preferences
```

**Tables that migrations `ALTER` but nothing creates — 7, and they are the core
of the app:**

```
profiles        channels        channel_posts    content_reports
watch_history   subscription_plans              subscription_requests
```

Plus `app_settings`, `channel_members`, `channel_videos`, `files`, `transfers`,
`notifications` and the storage buckets, which are referenced by policies and
functions but appear in no `CREATE` anywhere.

So `supabase/migrations/` is not a schema history. It is a **changelog against a
schema that was built by hand in the dashboard** and never captured. The first
migration in the folder is v40; v1–v39 were dashboard clicks. Everything before
v40 exists only inside the live project.

## What it costs

- **There is no local Supabase.** Anything tested end-to-end runs against
  production. `scripts/verify-stream-access.mjs` refuses to start without
  `--yes-write-to-production` for exactly this reason.
- **No CI.** A migration cannot be tested before it is applied to the live
  database.
- **No disaster recovery from git.** If the project were lost, this repository
  could not rebuild it. The 16 migration files would apply to nothing.
- **Review is guesswork.** A reviewer cannot see the table a migration alters,
  so a policy that silently widens access looks the same as one that does not.

The third point is the one worth escalating. Migrations in git create a
reasonable belief that the schema is version-controlled. It is not.

## The fix

A baseline migration that creates everything as it exists today, ordered before
v40, with the later migrations left untouched and made no-ops by their own
`IF NOT EXISTS` / `OR REPLACE` guards.

It must be **generated from the live database, not hand-written.** Hand-writing
it guarantees drift — a missing default, a `NOT NULL` that is not there, a
policy subtly rephrased — and drift in a baseline is worse than no baseline,
because it produces a local database that behaves differently from production
while looking authoritative.

### Generating it

Needs the database password (Supabase dashboard → Project Settings → Database).
That was **not** included in the handover archive — `.env` has the service-role
key, which is a PostgREST credential and cannot drive `pg_dump`.

```bash
npx supabase login
npx supabase link --project-ref wdtwjiixuueqejfraaod

# Schema only. --linked reads the linked project; no data leaves the database.
npx supabase db dump --linked -f supabase/migrations/20260101000000_v00_baseline.sql

# Storage buckets and their policies live in the storage schema, which the
# default dump skips.
npx supabase db dump --linked --schema storage -f /tmp/storage.sql
```

Then, in the generated file:

1. **Check the timestamp sorts first.** `20260101000000` precedes
   `20260622110000_migration_v40_db_hardening.sql`, which is what makes the
   rest of the folder replay on top of it.
2. **Strip the `auth` and `storage` schema definitions** that `db dump` emits —
   `supabase start` creates those itself and will collide.
3. **Append the storage bucket `INSERT`s** from the second dump, so
   `user-files`, `channel-media` and `channel-videos` exist locally. Do not
   re-create `payment-screenshots` write policies; v57 deliberately removed
   them.
4. **Verify the replay actually works**, which is the only thing that proves
   any of this:

   ```bash
   npx supabase start          # must reach "Started supabase local development setup"
   npx supabase db reset       # replays baseline + v40..v57 from zero
   ```

5. **Confirm no drift** against the live project:

   ```bash
   npx supabase db diff --linked --schema public
   ```

   Empty output means the baseline plus the migration chain reproduces
   production exactly. Non-empty output is the list of things the dashboard has
   that git does not — fix the baseline, not the diff.

### After it lands

- Every schema change goes through a migration file. No more dashboard DDL.
  This is the part that actually prevents the problem recurring, and it is a
  process rule, not a technical one.
- `npx supabase db reset` becomes part of CI, so a migration that cannot replay
  from zero fails before it reaches production.
- `verify-stream-access.mjs` can then point at the local stack, and stops being
  a script that writes to production.

## Why this branch did not do it

The credential is missing. Everything else on this branch was written to work
without it — v57 is guarded so it applies cleanly whether or not
`subscription_requests` is present, and the test harness declares its blast
radius and cleans up after itself.

Ask the owner for the database password, then run the block above. It is
roughly an hour of work, most of it in step 4 and 5, and it is the difference
between a schema that is in version control and one that only looks like it is.
