# Admin authorization & content workflow — status

Static verification against the repository. **No production database was
contacted.** Reproduce the authorization check with
`node scripts/audit-admin-guards.mjs`.

Canonical business rule, unchanged by this document: **admin approval gates who
may BUY, not who gets what they already paid for.** `approval_status` (v55) is
pre-purchase; `content_access_grants` (v56) is a separate per-content grant;
`verify-play-receipt` grants the plan unconditionally and does not read
`approval_status`. No post-payment manual approval step has been introduced.

---

## The eleven requirements

| # | Requirement | Status | Where |
|---|---|---|---|
| 1 | Admin login | **Works** | `profiles.is_admin`; `app/admin.tsx` |
| 2 | Admin content upload | **Works** | `app/admin/upload.tsx` → `generate-stream-upload` |
| 3 | Draft / published states | **Untested** | v56 added `'draft'` to the CHECK; see below |
| 4 | Free / Premium flag | **Works, hardened** | `stream-set-access` + v57 eager lock |
| 5 | Edit existing content | **MISSING** | no code path exists |
| 6 | Unpublish / remove | **Works** | `admin_set_post_status` |
| 7 | User search | **Works** | `admin_search_users` |
| 8 | Individual content grant | **Works** | `admin_grant_content_access` |
| 9 | Revoke grant | **Works** | `admin_revoke_content_access` |
| 10 | Audit log | **Works** | `admin_list_audit_log`, `admin_audit_log` |
| 11 | Report moderation | **Works** | `admin_resolve_report` |

### 5 — Edit existing content does not exist

`AdminContentService` exposes `setPostStatus` and `setPostAccessLevel` and
nothing else that mutates a post. There is **no way for an admin to change a
published post's title, description, thumbnail, or genre.** The only remedy
today is remove-and-re-upload, which loses the post id — and therefore every
`content_access_grants` row pointing at it, silently revoking access for every
granted user.

This is a real gap against the stated requirements and it interacts badly with
the grant system. It needs `admin_update_post(p_post_id, …)` as a
`SECURITY DEFINER` RPC with its own `is_admin` check and an audit row, plus a
screen. Not built on this branch.

### 3 — Draft state is new and unexercised

`lib/posts.ts` wrote `status: 'draft'` while the CHECK constraint allowed only
`('pending','approved','rejected','removed')`, so every draft save was rejected
by the database — probably since the feature was written. v56 added `'draft'`
to the constraint. The path is therefore correct-but-never-run. Worth one manual
pass before launch.

---

## Server-side authorization — 22 of 23 verified

Every admin RPC is `SECURITY DEFINER` and `GRANT`ed to `authenticated`, which
means **any signed-in user can invoke it directly over PostgREST with no app
involved.** The `isAdmin` checks in the screens are UX only. The function body
is the actual boundary.

22 of 23 re-verify the caller in their own body — 20 via a direct `is_admin`
test, 2 (`delete_channel`, `update_channel`) via `is_owner_or_admin()`, which
does the same check plus an ownership branch. That delegation is correct; an
earlier version of the audit script reported those two as unguarded, which was
a false positive.

### The one exception — `activate_approved_channels()` (Low-Medium)

```sql
CREATE OR REPLACE FUNCTION public.activate_approved_channels()
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN
  UPDATE public.channels SET status = 'active'
   WHERE status = 'pending'
     AND approval_expires_at IS NOT NULL
     AND approval_expires_at <= now();
END; $$;

GRANT EXECUTE ON FUNCTION public.activate_approved_channels() TO authenticated;
```

No `is_admin` check, and granted to every authenticated user. What it is: a
time-based sweeper that auto-activates channels whose approval timer has
expired.

**Bounded, but not harmless.** A caller cannot activate an arbitrary channel —
only ones already past `approval_expires_at`, which were going to be activated
anyway. What they *can* do is run the sweep on demand, repeatedly, from any
account. That gives:

- an unrate-limited batch `UPDATE` on `channels` callable by anyone
- no audit row for a status change that governs content visibility
- full dependence on `approval_expires_at` being correct — one channel with a
  mistakenly past timestamp becomes activatable by any user, instantly

There is also a product question underneath it, separate from the security one:
this design means **channels go live on a timer without a human ever looking at
them.** For a platform carrying 18+ UGC, that is the moderation posture Play's
UGC policy scrutinises hardest.

Recommended: restrict `EXECUTE` to `service_role`, drive it from `pg_cron` on a
schedule, and write an audit row per activation. If it must stay callable by the
app, add the `is_admin` check.

---

## `channels` UPDATE policy — needs a live check before launch

**Static finding, deliberately not stated as a live vulnerability.** I could not
verify it without database access.

`schema.sql` creates:

```sql
create policy "Owners can update their channels"
  on public.channels for update using (auth.uid() = owner_id);
```

No `WITH CHECK`, no column restriction. **No file anywhere in the repository
ever drops it.** If it is still live, any channel owner can `UPDATE` their own
row directly over PostgREST and set `status` from `'pending'` to `'active'` —
bypassing the entire admin approval queue.

The suspicious part is that `migration_v39_security_hardening.sql` introduced
`update_channel()` described in its own comment as *"Secure channel update via
RPC (replaces raw UPDATE from client)"* — but never dropped the raw-UPDATE
policy it was written to replace. That is the signature of a half-finished
migration, and `lib/posts.ts:412` and `:417` still do raw
`.from('channels').update(...)` from the client, which only works if such a
policy is live.

This is exactly the class of problem the reproducibility audit predicted: 62 of
the app's RLS policies are not in the migration chain, so nobody can review
them. Verify with:

```sql
-- read-only
SELECT polname, pg_get_expr(polqual, polrelid)  AS using_expr,
       pg_get_expr(polwithcheck, polrelid)      AS with_check
FROM pg_policy WHERE polrelid = 'public.channels'::regclass AND polcmd = 'w';
```

If the permissive policy is live, replace it with one that lets an owner edit
presentation columns only, and route status changes exclusively through
`update_channel()`.

---

## Authorization test matrix — specified, not yet run

`scripts/verify-stream-access.mjs` covers the content-access half (8 cases:
free, premium, expired, grant, revoked grant, banned, removed content,
unauthenticated). It has **not been run** — it writes to production, and needs
explicit confirmation of the target project first.

Not yet covered by any harness, and needed before launch:

| Case | Expected |
|---|---|
| Normal user calls `admin_grant_content_access` directly | `42501` |
| Normal user calls `admin_set_post_status` directly | `42501` |
| Normal user calls `admin_search_users` directly | `42501` |
| Normal user calls `activate_approved_channels` | **currently succeeds** |
| Normal user raw-`UPDATE`s a channel they own to `status='active'` | needs the live policy check above |
| Suspended admin calls any admin RPC | **undefined** — no admin RPC checks the caller's own `account_status`, only `is_admin` |

That last row is worth deciding explicitly: suspending an admin account today
does **not** revoke its admin powers. Whether it should is a product call, but
it should be a decision rather than an accident.
