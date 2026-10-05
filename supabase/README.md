# Backend: database and edge functions

Cloudlynk's backend is one Supabase project (ref `wdtwjiixuueqejfraaod`): Postgres with row level
security, Auth, Storage, and the edge functions in [`functions/`](functions/README.md). The app
talks to Postgres directly through supabase-js; whatever needs a secret or must not be trusted to
the client lives in a function or a `SECURITY DEFINER` RPC.

## Folder map

| Path            | What it is                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `migrations/`   | Every schema change since v40, one file each, applied in filename order. The source of truth for changes. |
| `functions/`    | Edge functions (Deno). See [`functions/README.md`](functions/README.md).                             |
| `config.toml`   | Supabase CLI settings: which functions skip the gateway's JWT check, and why.                        |
| `tests/`        | `premium_rls_matrix_test.sql`: proves the premium content policy in Postgres itself. Self-cleaning (ends in `ROLLBACK`). |
| `maintenance/`  | One-off scripts run by hand, never part of the chain: the v57/v58 rollback and the pre-launch test-data cleanup. Read each header first. |
| `legacy-sql/`   | The hand-run SQL from before `migrations/` existed (the original schema and v2-v39). History only; never run. |
| `BASELINE.md`   | Why the migrations cannot build the database from zero yet, and the exact steps to fix that.         |

## Changing the schema

1. Add `migrations/<UTC timestamp>_v<NN>_<what_it_does>.sql`, numbered after the last file.
2. Write it to be re-runnable: `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` before
   `CREATE POLICY`. Open with a comment saying why the change is needed.
3. Apply it to the project (SQL editor, files in order), then regenerate the app's types:
   `npm run db:types`. `src/lib/database.types.ts` is generated; never edit it by hand.
4. Never change the schema from the dashboard. The tables created before v40 were made that way, and
   that is why `BASELINE.md` exists.

## Security model

- **Row level security is the boundary.** The app uses the anon key and the user's session, so every
  table it reads or writes has policies, and those policies (not app code) decide who sees what.
  Premium content, guest browsing and blocked users are all enforced here.
- **Privileged columns are guarded by triggers.** `protect_profile_privileged_fields` (v48) and
  `protect_channel_privileged_fields` (v60) revert any write to plan, admin and approval fields that
  does not come through a trusted path. Grant a plan with `apply_play_entitlement` or
  `grant_gateway_payment`, never a direct `UPDATE`.
- **Admin actions are RPCs.** The `admin_*` functions re-check `is_active_admin()` in the database,
  record changes in `admin_audit_log`, and cannot be executed by `anon` or `public` (v69, v70).
- **Some tables are server-only.** `stream_videos`, `upload_rate_limit_log`, `iap_purchases` and
  `payment_orders` are written by edge functions with the service role; the app never touches them.

## Schema overview

The `public` schema, grouped by what it serves. Columns are in `src/lib/database.types.ts`.

**Accounts**

| Table              | Holds                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `profiles`         | One row per user: name, avatar, plan status and dates, approval, standing, policy acceptance, storage use, preferences |
| `user_devices`     | Devices a user signed in on (admin support view)                                          |
| `user_preferences` | Player defaults: quality, speed, subtitles, autoplay                                      |
| `user_blocks`      | Who blocked whom; blocked authors' posts are hidden by policy                             |

**Channels and content**

| Table             | Holds                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `channels`        | Channels, their owner, visibility, approval status and counters                              |
| `channel_members` | Membership and role per channel                                                              |
| `channel_posts`   | Every title: movie, series episode, short or post. Status, `access_level` (free / premium), Cloudflare video UID, metadata |
| `series`          | A series' own details, grouping its episodes                                                 |
| `subtitles`       | WebVTT files per video                                                                       |
| `channel_videos`  | Legacy storage-hosted channel videos, from before Cloudflare Stream                          |

**Playback and video**

| Table                   | Holds                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `stream_videos`         | Each Cloudflare Stream UID, its uploader, and whether it is locked to signed URLs      |
| `watch_history`         | Resume position and completion per user and post                                       |
| `post_view_log`         | One view per user per post per day, behind `view_count`                                |
| `upload_rate_limit_log` | Upload URLs issued, for the per-minute limit in `generate-stream-upload`               |

**Billing**

| Table                   | Holds                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `subscription_plans`    | The plans on sale: code (= Play base plan), price, duration, order                         |
| `iap_purchases`         | Google Play purchase tokens and their state, kept current by `play-rtdn-webhook`           |
| `payment_orders`        | UPI / Razorpay / Sabpaisa orders, from creation to `grant_gateway_payment`                 |
| `subscription_requests` | The retired manual payment flow (screenshot plus admin review); read-only history          |
| `content_access_grants` | Admin grants of one post to one user, without a plan                                       |

**Files, notifications, moderation**

| Table             | Holds                                                         |
| ----------------- | ------------------------------------------------------------- |
| `files`           | The personal cloud: files in the private `user-files` bucket   |
| `transfers`       | Upload and download progress shown in the Cloud tab            |
| `notifications`   | In-app notifications, delivered over realtime                  |
| `content_reports` | Reports against posts, users and files, and their resolution   |
| `admin_audit_log` | Every admin action: who, what, on which row, with before/after |
| `app_settings`    | Key-value settings read by the app (geo rules and similar)     |

**Views:** `premium_preview` (what a viewer without a plan may see of a premium title) and
`free_post_media` (the media of free posts, readable by guests for free playback, v63).

**Storage buckets:** `user-files` (private, the Cloud tab), `channel-media` (public: thumbnails and
profile pictures), `channel-videos` (legacy). `payment-screenshots` belongs to the retired manual
flow and accepts no new writes.

## RPCs the app calls

The ~70 functions in `public` fall into a few families; the generated types list them all.

| Family              | Examples                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| Access checks       | `is_plan_active`, `has_content_access`, `can_post_to_channel`, `is_active_admin`  |
| Account             | `accept_terms`, `confirm_adult`, `set_birth_year`, `export_my_data`, `get_my_subscription_status` |
| Channels            | `join_channel`, `leave_channel`, `update_channel`, `delete_channel`               |
| Content             | `get_my_channel_posts`, `record_post_view`                                        |
| Moderation (admin)  | `approve_post`, `reject_post`, `approve_channel_content`, `admin_resolve_report`  |
| Administration      | `admin_list_*`, `admin_set_*`, `admin_update_*`, `admin_grant_content_access`     |
| Entitlements        | `apply_play_entitlement`, `grant_gateway_payment`, `expire_lapsed_plans` (scheduled) |
