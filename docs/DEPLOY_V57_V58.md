# Deployment runbook — v57, v58, v59, v60

**Status: NOT DEPLOYED. Blocked on CLI authentication.**

> Scope grew after this was written: v59 and v60 landed on the same branch and
> deploy in the same push. A third edge function, `admin-replace-video`, joins
> the two billing ones. Sections 2, 6, 7 and 8 cover all four migrations.

```
$ npx supabase migration list --linked
Initialising login role...
{"code":"LegacyDbConfigLoginRoleStatusError","message":"unexpected login role status 401: Unauthorized"}
```

The project ref is on disk from the handover, but there is no access token.
`npx supabase login` opens a browser and needs a human. So the push and the
function deploys have to be run by someone who can authenticate. Everything
else — the pre-flight, the fixes it produced, and the rollback — is done.

**The pre-flight was not a formality. It found two defects in these two
migrations that would each have caused a production incident.** Both are fixed;
see §3.

---

## 1. Project ref

```
wdtwjiixuueqejfraaod        (org munordschbmrniodvarj, project "cloud")
```

Matches `EXPO_PUBLIC_SUPABASE_URL` in `.env`, `supabase/.temp/project-ref`, and
`BACKEND_REFERENCE.md`. Confirm it in the dashboard before pushing — this is
the only production database and there is no staging.

---

## 2. Exactly what changes

### v57 — `20260906180000_v57_viewer_status_and_legacy_payment_retirement.sql`

| Statement | Object | Type |
|---|---|---|
| `CREATE OR REPLACE FUNCTION` | `admin_set_signed_lock(text)` | **New** |
| `GRANT EXECUTE` | `admin_set_signed_lock` → `authenticated` | New grant |
| `DROP POLICY IF EXISTS` | `channel_posts_select_v56` | **Replaced** |
| `CREATE POLICY` | `channel_posts_select_v57` | Replacement |
| `DROP FUNCTION IF EXISTS` ×4 | `approve_subscription_request(uuid)`, `(uuid,uuid)`, `reject_subscription_request(uuid,text)`, `(uuid,text,uuid)` | **Dropped** |
| `REVOKE ALL` | `subscription_requests` from `authenticated`, `anon` | Grant removal |
| `COMMENT ON TABLE` | `subscription_requests` | Metadata |
| `DROP POLICY IF EXISTS` ×4 | the `payment-screenshots` storage policies | **Dropped** |
| `UPDATE storage.buckets` | `payment-screenshots` → `public = false` | 1 row |

### v58 — `20260906210000_v58_fix_service_role_entitlement_writes.sql`

| Statement | Object | Type |
|---|---|---|
| `DO $mig$` guard | aborts if `profiles.approval_status` is missing | Safety |
| `CREATE OR REPLACE FUNCTION` | `apply_play_entitlement(uuid,text,timestamptz)` | **New** |
| `REVOKE ALL` | from `PUBLIC`, `anon`, `authenticated` | Lockdown |
| `GRANT EXECUTE` | → `service_role` **only** | New grant |
| `CREATE OR REPLACE FUNCTION` | `protect_profile_privileged_fields()` | **Replaced** |

### v59 — `20260907090000_v59_admin_edit_and_replace_media.sql`

| Statement | Object | Type |
|---|---|---|
| `CREATE OR REPLACE FUNCTION` | `admin_update_post(uuid,text,…,text[])` | **New** |
| `CREATE OR REPLACE FUNCTION` | `admin_replace_post_video(uuid,text)` | **New** |
| `REVOKE` / `GRANT EXECUTE` | both → `authenticated`, not `anon` | New grants |

Additive only. No drops, no data writes.

### v60 — `20260907120000_v60_admin_standing_and_channel_writes.sql`

| Statement | Object | Type |
|---|---|---|
| `CREATE OR REPLACE FUNCTION` | `is_active_admin()` | **New** |
| `CREATE OR REPLACE FUNCTION` | `admin_grant_content_access(...)` | **Replaced** — guard line only |
| `CREATE OR REPLACE FUNCTION` | `admin_revoke_content_access(...)` | **Replaced** — guard line only |
| `CREATE OR REPLACE FUNCTION` | `activate_approved_channels()` | **Replaced** — adds audit, fixes RETURNING |
| `REVOKE ALL` / `GRANT` | `activate_approved_channels` → `service_role` only | **Grant narrowed** |
| `CREATE OR REPLACE FUNCTION` | `protect_channel_privileged_fields()` | **New** |
| `DROP TRIGGER IF EXISTS` / `CREATE TRIGGER` | `channels_guard_privileged_fields` on `channels` | **New trigger** |

No `DROP TABLE`, no `DELETE`, no `TRUNCATE`, no policy changes.

**Behaviour change worth knowing before you push:** after v60, a suspended or
banned admin can no longer grant or revoke content access. If any working admin
account is not `account_status = 'active'`, it stops being able to do those two
things. Check first:

```sql
SELECT id, email, account_status FROM public.profiles WHERE is_admin = true;
```

### Functions dropped or replaced — the full list

**Dropped (4):** `approve_subscription_request` ×2 overloads,
`reject_subscription_request` ×2 overloads. Verified unreferenced: no call site
in `app/`, `lib/`, `hooks/` or any edge function. The only surviving mention is
a string literal in `app/export-data.tsx:33` naming an export key, which does
not invoke them.

**Replaced (2):** `protect_profile_privileged_fields()` — body changed, see §3.2.
`channel_posts_select_v57` supersedes `_v56` — one policy in, one out. Exactly
one SELECT policy must exist on `channel_posts`; two would `OR` together and
widen access.

### No destructive data operation

- **No `DROP TABLE`.** None anywhere in either file.
- **No `DELETE`, no `TRUNCATE`.** None anywhere in either file.
- **No `ALTER TABLE ... SET SCHEMA`** — removed in pre-flight, see §3.1.
- The only `UPDATE` touching user data is
  `UPDATE storage.buckets SET public = false WHERE id = 'payment-screenshots'`
  — one metadata row, no objects removed.
- `subscription_requests` keeps every row. It loses its grants, not its data.

---

## 3. Two defects the pre-flight caught

### 3.1 — v57 would have broken the GDPR data export

The original draft did `ALTER TABLE public.subscription_requests SET SCHEMA
retired`. But `export_my_data()`
(`migration_v30_fix_export_my_data.sql:43`) contains
`from public.subscription_requests sr`, and it is `SECURITY DEFINER` with
`SET search_path = public`. After the move the table would not resolve and
**every account data export would fail** — a DPDPA/GDPR feature, broken
silently, discovered by a user exercising a legal right.

Fixed: `REVOKE ALL ... FROM authenticated, anon` instead. Same outcome —
unreachable from the app, because PostgREST executes as the caller's role —
without the side effect, because `SECURITY DEFINER` runs as the function owner
and keeps its access.

### 3.2 — v58 would have removed the approval gate's protection

v58 replaces `protect_profile_privileged_fields()` wholesale. The draft body was
based on the **v52** version. But **v55** amended that function to add four
lines:

```sql
NEW.approval_status := OLD.approval_status;
NEW.approval_reviewed_by := OLD.approval_reviewed_by;
NEW.approval_reviewed_at := OLD.approval_reviewed_at;
NEW.approval_note := OLD.approval_note;
```

Deploying the draft would have dropped them, letting **any user set their own
`approval_status` to `approved`** over PostgREST and walk through the
pre-purchase gate. A security regression introduced by a security fix.

Fixed: all four lines carried forward, with a comment saying why they must not
be dropped again, plus a `DO` block that aborts the migration if
`approval_status` is missing rather than installing a trigger referencing a
column that does not exist.

---

## 4. Is it safe against the current production schema?

Yes, with one thing to verify first.

**Verify before pushing** — confirm `channel_posts_select_v56` is actually the
live policy. If production is on `_v52` instead (i.e. v56 never applied), v57's
`DROP POLICY IF EXISTS ..._v56` silently does nothing, `_v52` survives, and
you end up with **two** SELECT policies OR'd together — wider access, not
narrower.

```sql
-- read-only
SELECT polname FROM pg_policy
WHERE polrelid = 'public.channel_posts'::regclass AND polcmd = 'r';
```

Expected: exactly `channel_posts_select_v56`. Anything else, stop and reassess.

Everything else is safe by construction: every `DROP` is `IF EXISTS`, every
`CREATE FUNCTION` is `OR REPLACE`, the `REVOKE` and `COMMENT` are inside an
existence guard, and the bucket `UPDATE` affects zero rows if the bucket is
absent. Both files are idempotent and can be re-run.

Migrations run inside a transaction, so the `DROP POLICY` / `CREATE POLICY`
pair in v57 is atomic — there is no window where `channel_posts` has no SELECT
policy.

---

## 5. Backup and rollback

There is **no automatic pre-migration snapshot**. Take one manually:

```bash
npx supabase db dump --linked -f backups/pre-v57-$(date +%Y%m%d-%H%M).sql
npx supabase db dump --linked --data-only \
  -f backups/pre-v57-data-$(date +%Y%m%d-%H%M).sql
```

`backups/` is already gitignored — it contains production PII.

Also available, depending on plan: Free tier has daily backups (up to 24h of
loss); Pro has point-in-time recovery. **Check which plan this project is on
before pushing** — on Free, the daily backup is the only floor.

Targeted rollback that does not need a restore:
**`supabase/rollback/v57_v58_rollback.sql`** — restores the v55 trigger body,
drops the new RPC, and puts `channel_posts_select_v56` back (creating the
replacement before dropping v57's, inside a transaction, so the feed is never
policy-less). Read its header: rolling back v58 reintroduces the bug where paid
subscriptions never activate, and the edge functions must be reverted at the
same time.

---

## 6. Edge functions to redeploy — exactly two

| Function | Why | Change |
|---|---|---|
| `verify-play-receipt` | Calls `apply_play_entitlement` instead of a direct UPDATE; now returns 500 rather than reporting a valid purchase it could not activate | `index.ts:139` |
| `play-rtdn-webhook` | Same, at two sites — voided purchases and renewal/expiry | `index.ts:124,157` |

**Ordering matters.** Push the migration *first*. The new function code calls
`apply_play_entitlement()`, which does not exist until v58 lands — deploying
the functions first breaks every purchase verification until the migration
catches up.

| `admin-replace-video` | **New function** (v59). Locks a new video on Cloudflare before it replaces the old one on a premium post | new directory |

Also changed earlier on this branch and needing redeploy if you are shipping the
whole thing: `stream-playback-token`, `stream-set-access`, `generate-stream-upload`.
They depend on `admin_set_signed_lock` from v57, so they also go **after** the
migration. Full set, in order:

```bash
npx supabase functions deploy verify-play-receipt
npx supabase functions deploy play-rtdn-webhook
npx supabase functions deploy admin-replace-video
npx supabase functions deploy stream-playback-token
npx supabase functions deploy stream-set-access
npx supabase functions deploy generate-stream-upload
```

---

## 7. The commands

```bash
# 0. authenticate (interactive — needs a human)
npx supabase login
npx supabase link --project-ref wdtwjiixuueqejfraaod

# 1. confirm what will be applied — expect exactly v57 and v58 as unapplied
npx supabase migration list --linked

# 2. snapshot
mkdir -p backups
npx supabase db dump --linked -f backups/pre-v57-$(date +%Y%m%d-%H%M).sql

# 3. the read-only pre-check from §4
#    (run in the SQL editor; expect exactly channel_posts_select_v56)

# 4. push
npx supabase db push --linked

# 5. functions, AFTER the migration
npx supabase functions deploy verify-play-receipt
npx supabase functions deploy play-rtdn-webhook
npx supabase functions deploy admin-replace-video
npx supabase functions deploy stream-playback-token
npx supabase functions deploy stream-set-access
npx supabase functions deploy generate-stream-upload
```

---

## 8. Post-deploy verification

Run in order. Read-only except step 6.

```sql
-- 1. both migrations recorded
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version IN ('20260906180000','20260906210000','20260907090000','20260907120000');
-- expect 4 rows

-- 2. the new RPC exists, is SECURITY DEFINER, has a pinned search_path
SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'apply_play_entitlement';
-- expect: security_definer = true, proconfig = {search_path=public}

-- 3. ONLY service_role may execute it
SELECT grantee, privilege_type FROM information_schema.role_routine_grants
WHERE routine_name = 'apply_play_entitlement';
-- expect service_role only. If `authenticated` appears, STOP — any user
-- could award themselves premium. Re-run the REVOKE from v58 immediately.

-- 4. exactly one SELECT policy on channel_posts, and it is v57
SELECT polname FROM pg_policy
WHERE polrelid = 'public.channel_posts'::regclass AND polcmd = 'r';
-- expect exactly: channel_posts_select_v57

-- 5. the retired functions are gone
SELECT proname FROM pg_proc
WHERE proname IN ('approve_subscription_request','reject_subscription_request');
-- expect 0 rows

-- 6. approval columns are still protected (the 3.2 regression check)
SELECT prosrc LIKE '%approval_status := OLD.approval_status%' AS approval_protected
FROM pg_proc WHERE proname = 'protect_profile_privileged_fields';
-- expect true

-- 7. v60: the sweeper is no longer callable by ordinary users
SELECT grantee, privilege_type FROM information_schema.role_routine_grants
WHERE routine_name = 'activate_approved_channels';
-- expect service_role only — `authenticated` must NOT appear

-- 8. v60: the channel guard trigger is installed
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.channels'::regclass AND NOT tgisinternal;
-- expect channels_guard_privileged_fields among them

-- 9. v60 section 3 reported which branch it took — check the migration
--    output for one of:
--      'replaced the permissive channels UPDATE policy'   (hole was real, now closed)
--      'permissive channels UPDATE policy not present'    (verify policies by hand)
```

Then, from the repo:

```bash
# 7. the privileged-write path — a service-role UPDATE should now be trusted
node scripts/verify-stream-access.mjs --yes-write-to-production
```

That harness now reads its fixtures back and **aborts** if a privileged column
did not take, so it doubles as the check that v58 worked. Before v58 it could
not establish `plan_status`, `account_status` or `is_admin` at all. After v58
all eight cases should be genuinely testable for the first time:

| # | Case | Expected |
|---|---|---|
| 1 | Free user → premium content | DENY |
| 2 | Active premium → premium | PASS |
| 3 | Expired premium | DENY |
| 4 | Explicit grant | PASS |
| 5 | Revoked grant | DENY |
| 6 | Banned user with live plan | DENY |
| 7 | Removed content | DENY |
| 8 | Unauthenticated | DENY |

Run it **without** `--keep` so it cleans up after itself.

### Entitlement round-trip — the thing that was actually broken

```sql
-- pick a disposable test account, note its current state first
SELECT plan_status, plan_expires_at FROM public.profiles WHERE id = '<uuid>';

-- simulate what verify-play-receipt now does
SELECT public.apply_play_entitlement('<uuid>', 'active', now() + interval '30 days');
SELECT plan_status, plan_expires_at, plan_started_at
FROM public.profiles WHERE id = '<uuid>';
-- expect: active, ~30 days out, plan_started_at set

-- expiry
SELECT public.apply_play_entitlement('<uuid>', 'expired', now() - interval '1 day');
-- revocation
SELECT public.apply_play_entitlement('<uuid>', 'cancelled', NULL);

-- and confirm a normal user still cannot call it
-- (run as an authenticated user, NOT service_role)
SELECT public.apply_play_entitlement('<uuid>', 'active', now() + interval '1 year');
-- expect: permission denied for function apply_play_entitlement
```

---

## 9. Test fixtures currently in production

Left behind from the `--keep` run, all prefixed `_authtest_`, channel is
`is_public = false` so no real user can see them:

```
posts    ff7b9f7c-f282-4e2a-8fd3-5486962b527d
         e6a3c7c1-1516-4c2a-9b29-a34a2ce72ff9
channel  a13a1e2b-3b78-47ae-b09a-e90ba168417d
users    6dd1d4e4-2e94-475e-bf91-082c24058bbf   (full_name set to a probe marker)
         5aca0924-7e0b-4f04-9954-f141a3f91149
         eef1e7fd-fa9d-430b-b09c-26d06cce7072
         a428cfb3-0773-40a9-bd7c-de9344416257
         f6e269d4-8f0a-43e7-a66d-8efb3944e817
         a542c8e0-4653-4e43-aa2d-543a82b40f65
         3264d750-4eb9-4ebe-b043-4f35890745fb
```

Cleanup, in this order:

```sql
DELETE FROM public.content_access_grants WHERE post_id IN
  ('ff7b9f7c-f282-4e2a-8fd3-5486962b527d','e6a3c7c1-1516-4c2a-9b29-a34a2ce72ff9');
DELETE FROM public.channel_posts WHERE id IN
  ('ff7b9f7c-f282-4e2a-8fd3-5486962b527d','e6a3c7c1-1516-4c2a-9b29-a34a2ce72ff9');
DELETE FROM public.channel_members WHERE channel_id = 'a13a1e2b-3b78-47ae-b09a-e90ba168417d';
DELETE FROM public.channels WHERE id = 'a13a1e2b-3b78-47ae-b09a-e90ba168417d';
-- then delete the seven auth users from Dashboard → Authentication → Users
-- (search `_authtest_`), which cascades their profiles
```

---

## 10. Remaining blockers after this deploys

| Blocker | Needs |
|---|---|
| Play Console account | Client — nothing can be tested against real billing without it |
| Database password | Owner — for the baseline migration (`supabase/BASELINE.md`) |
| `CLOUDFLARE_STREAM_CUSTOMER_CODE` | Verify it is set, or signed playback 500s on every premium play |
| Keystore passwords | Owner — the release AAB cannot be signed without them |
| `terms.ts` says Play Billing | Contradicts the web+UPI decision — see `PLAY_STORE_LISTING.md` §6.1 |
| Google auth provider still on | Dashboard → Authentication → Providers → disable Google |
