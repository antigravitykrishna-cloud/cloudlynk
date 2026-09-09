# Admin access — how to get in and what's in there

**Updated 2026-09-10**, after the login rebuild (guest / Google / email code).

---

## Why there is no password in this document

I can't create accounts or set passwords, so there is no admin password to hand
over — and after the login rebuild there doesn't need to be one. **The app no
longer uses passwords at all.** Sign-in is a 6-digit code sent to the address
you type. Whoever controls the mailbox controls the account.

That has a practical consequence worth understanding before you hand anything
to your client:

> **Admin access = control of the admin mailbox.** Give the client admin on an
> address *they* own; never share an existing admin account's inbox.

---

## The two admin accounts that exist today

| Email | Notes |
|---|---|
| `krishnapate43@gmail.com` | Yours. 37 approved posts attributed to it. |
| `admin@cloudlynk.app` | Second admin. **Only usable if that mailbox actually receives mail** — if `cloudlynk.app` has no inbox configured, no sign-in code can arrive and this account is unreachable. Check before relying on it. |

---

## Signing in as admin

1. Open the app → the login screen.
2. Tap **Continue with email**.
3. Type the admin address → **Send code**.
4. Enter the 6-digit code from the inbox.
5. First time only: birth year + accept the policies (the 18+ gate — it is a
   Play content-rating requirement and cannot be skipped).

You land on **Explore**. The admin tools are on the **Profile** tab.

---

## Making someone else an admin

One statement in **Supabase → SQL Editor**. They must have signed in once first,
so a profile row exists:

```sql
update public.profiles
set is_admin = true
where email = 'client@example.com';
```

Confirm it took:

```sql
select email, is_admin, account_status, plan_status
from public.profiles
where is_admin = true;
```

To revoke, set `is_admin = false`. Nothing else needs changing — every admin
screen re-checks `is_admin` server-side on every call, so access appears and
disappears immediately.

### Giving the client premium without charging them

Admin is not the same as subscribed. To let a tester see premium content:

```sql
-- 30 days of premium for one tester
select public.apply_play_entitlement(
  (select id from public.profiles where email = 'client@example.com'),
  'active',
  now() + interval '30 days'
);
```

Use this rather than `update profiles set plan_status = ...` — `plan_status` is
trigger-protected and a direct update is silently reverted (see the v58
migration for what that bug looked like in production).

---

## What's in the admin panel

**Profile tab** → these rows appear only when `is_admin` is true:

| Row | What it does |
|---|---|
| **Admin Panel** | The approval queue — pending channels and pending posts, approve/reject |
| **Admin: Pending Channels** | Channels awaiting approval |
| **Pending Channel Content** | Posts awaiting approval, before they go live |
| **Channel Activity** | Per-channel activity overview |
| **Reports (Content & Users)** | Moderation queue for user-filed reports — required by Play's UGC policy |
| **User Approvals** | The pre-purchase vetting gate: who may reach the subscribe flow. Also shows per-user content grants |
| **Subscribers** | **New.** Subscriber cohorts — Expired / Ending / Active / Cancelled / Free, with counts and search |
| **Content & Access** | Edit post metadata, replace thumbnail or video, grant one person access to one post |
| **Upload Content** | Admin upload path |
| **Audit Log** | Record of admin actions |

### Subscribers screen — read-only by design

It shows who is in which cohort; it has no button to change a plan. That is
deliberate. `plan_status` already has three writers — `verify-play-receipt`,
`play-rtdn-webhook`, and the hourly expiry sweeper. A fourth writer clicking a
button in the app would race them, and the next RTDN message from Google would
overwrite whatever it set. Use `apply_play_entitlement` (above) for deliberate
grants, and per-post grants in **Content & Access** for one-off access.

The **Expired** cohort deliberately includes accounts still marked `active`
whose date has passed. The sweeper runs hourly, so there is a window where the
status column is stale — but access is *already* revoked, because the gate
reads the date, not the status. Showing them as active would be a lie.

---

## Subscription expiry — what happens automatically

Since v75, all of this runs without anyone touching it:

| When | What |
|---|---|
| The moment `plan_expires_at` passes | Premium access stops. Both the API and the video player agree, because they now call the same `is_plan_active()` function |
| 3 days before expiry | "Your subscription ends soon" notification, once per term |
| Hourly, at :07 | Lapsed plans move `active` → `expired` and get "Your subscription has ended" |

Check the jobs are alive:

```sql
select jobname, schedule, active from cron.job where jobname like 'cloudlynk-%';
```

---

## Account deletion (what a reviewer will test)

Both routes work as of 2026-09-10:

- **In app:** Profile → Delete Account
- **On the web:** <https://thecloudlynk.com/delete-account.html>

If you test this with an admin account, note that it now genuinely deletes.
Posts that account approved survive with the approver field nulled — moderation
history is kept, the personal link is not.
