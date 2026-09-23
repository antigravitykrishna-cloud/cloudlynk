# Security, logic and scale audit — 2026-09-24

Everything below was found by reading the live database policies, functions,
triggers and storage rules, and the edge functions, then fixed and re-tested
as a real signed-in non-admin user (inside rolled-back transactions).

## Fixed

| # | Severity | Problem | Fix |
|---|---|---|---|
| 1 | Critical | One Google Play purchase unlocked Premium on unlimited accounts: any account could send the same purchase token to `verify-play-receipt`, and the token was even moved to the newest caller. | First account to verify a token owns it; others get 409. (`verify-play-receipt` v4) |
| 2 | Critical | Google Play purchases could never activate: the app called `verify-play-receipt` with no login token, so every call got 401. | App sends the session token (`lib/services/iap.ts`). |
| 3 | Critical | Posts, channel videos, series and channels could be **created** already `approved`/`active`/official — the field guards ran on UPDATE only. With public channels open to everyone, anyone could publish unmoderated content. | BEFORE INSERT guards force `pending` / non-official / zero counters for non-admins (v85). |
| 4 | High | Anyone signed in could add themselves to any channel directly (incl. hidden ones, any role), bypassing `join_channel`. | Direct inserts limited to an owner joining their own channel (v85). |
| 5 | High | Posting needed only membership; membership of public channels is now open. | Posting requires `can_post_to_channel` (admin, upload-approved account, owner, moderator) (v85). |
| 6 | High | 15 GB storage quota bypass: `storage_used` self-editable; `decrement_storage_used` subtracted any amount; file sizes were whatever the app claimed. | Database counts real object sizes (trigger on `storage.objects`), rejects uploads over quota, counter guarded, RPCs only re-sync (v85). |
| 7 | High | Public `channel-media` bucket accepted uploads anywhere from any signed-in user (free public file hosting). | Loose policy removed; own-folder policy kept (v85). |
| 8 | Medium | Channel owners could set their own member/post counts; `increment_channel_members` let anyone bump any channel; post counts never went down. | Counters trigger-maintained, guarded, recomputed (v85). |
| 9 | Medium | View counts inflatable without limit (`record_post_view` in a loop). | One view per account per post per day (v85). |
| 10 | Medium | `creator_status` / `role` self-editable. | Guarded (v85). |
| 11 | Low | Payment orders could be spammed. | Max 10 orders / account / 10 min (v85). |
| 12 | Logic | "Payment failed, no money was taken" shown when the person merely closed the checkout — false for a UPI payment that completes afterwards. | Separate "Payment not completed" message (app). |
| 13 | Logic | Website refund form claimed it had sent a request but sent nothing; its script also had a syntax error. | Opens the email app with the message filled in (site). |

## Scale

- 65 RLS policies evaluated `auth.uid()` once per row; rewritten to once per query (v86).
- Indexes added for 19 foreign keys and for the hottest reads: a channel's approved posts, all approved posts newest-first / by views, a user's notifications and unread count, public channels by members (v86).
- Duplicate policies removed (v85, v87).
- Unbounded list reads capped (channel posts 300, own files 500).

## Still to do outside the code

- Supabase: move to the **Pro plan** before launch (daily backups, no pausing, higher connection and egress limits).
- Supabase Auth settings: turn on **leaked password protection**; set OTP rate limits and a 10-minute OTP expiry.
- Cloudflare Stream: set a monthly spend alert.
