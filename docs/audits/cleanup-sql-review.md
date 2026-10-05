# Review — Phase 2 test-data cleanup script

Reviewing `supabase/cleanup/2026-08-03-remove-test-data.sql` against the **actual current data**, not just in the abstract. Cross-checked the script's `WHERE email ILIKE '%test%' OR email ILIKE '%example%'` clause against the real `auth.users` table content from the local backup taken earlier today (`backups/pre-launch-backup-data-2026-08-03.sql` — not committed, gitignored, contains live PII so treating it as reference-only, not pasting raw dump content anywhere else).

**Note on this file:** it names real user emails below so you can act on it. I have not committed it (per "no new commits without my go") — tell me if you want the emails redacted before it goes in the repo, or if you're fine with it as-is (private repo).

## Bottom line: the script is too LAX, not too aggressive

There are **20 users** in the current database. The pattern only catches **7 of them (35%)**. The other 13 (65%) — several of which are obviously not real customers — would survive the cleanup script untouched.

### Caught by the current pattern (7)

| Email | Why it matches |
|---|---|
| `kptest@gmail.com` | "test" |
| `krishnatest@gmail.com` | "test" |
| `smoke-16-1782424520480@example.com` | "example" |
| `test_verifier_11716@streamly.app` | "test" |
| `test_verifier_83233@streamly.app` | "test" |
| `test-15b-storage-1782145983746@example.com` | "test" + "example" |
| `teste2e@gmail.com` | "test" |

These 7 all look confidently like automated/dev test accounts (verifier scripts, smoke tests, storage tests). Safe to delete.

### NOT caught by the current pattern (13) — this is the real finding

| Email | Assessment |
|---|---|
| `123@gmail.com` | Digits-only local part — almost certainly a throwaway dev account |
| `abc@gmail.com` | Same pattern |
| `acc@gmail.com` | Same pattern |
| `k@gmail.com` | Single letter — clearly a dev account |
| `kp123@gnail.com` | **`gnail.com` is not a real domain** (typo of gmail.com) — this email can never receive mail, definitely fake/test |
| `upi@gmail.com` | Named after the feature being tested (UPI payments) — this is almost certainly the account used for the UPI real-money test earlier today |
| `jhon@gmail.com` | Misspelled "john" — likely a dev test account, could theoretically be a real name |
| `patel@gmail.com`, `sahil@gmail.com`, `perfumwala@gmail.com`, `tanishqkachi1234090@gmail.com` | Generic names, no test signal either way — genuinely ambiguous, could be real early testers/friends-and-family accounts |
| `krishna@gmail.com`, `krishnapate43@gmail.com` | **These look like your own developer accounts** (matches the git commit author "KrishnaSmuPatel") — flagging for your confirmation rather than assuming and auto-deleting the project owner's own account |

## Recommendation

For a **one-time pre-launch pass on only 20 total users**, don't try to cleverize the regex further — at this scale, individual review is more accurate than any pattern. Suggested approach:

1. Run Section 2 as-is first (catches the unambiguous 7).
2. For the remaining 13, you eyeball the list above and tell me (or just run manually) which specific ones to also remove — e.g. an explicit `WHERE id IN (...)` list for `123@gmail.com`, `abc@gmail.com`, `acc@gmail.com`, `k@gmail.com`, `kp123@gnail.com`, `upi@gmail.com`, and whichever of the ambiguous ones you confirm are test/dev, not real people.
3. Leave `krishna@gmail.com` / `krishnapate43@gmail.com` alone unless you confirm you want your own dev account(s) purged too.

I can write that follow-up explicit-ID delete statement once you tell me which of the 13 to include — didn't want to guess and hardcode account decisions into a script without your sign-off.

## Other things checked (no changes needed)

- **View count reset (Section 3):** even though this zeroes real data, it's fully recoverable — the pre-launch data backup taken earlier today already has the pre-reset `view_count` values, so this isn't a one-way door if you change your mind later.
- **Channel/post name pattern preview (Section 1e):** correctly scoped as preview-only, not part of the active DELETE — a real channel could legitimately have "test" in its name, so this was deliberately left for manual judgment rather than automated.
- **Storage cleanup (Section 4):** correctly left preview-only rather than attempting automated deletes — confirmed this was the right call, not a missed shortcut.
- **`%test%`/`%example%` as substring (not word-boundary) matches:** fine for this one-time pass at 20 users where every match gets eyeballed anyway. If this script gets reused later post-launch with a much bigger user base where nobody reviews every row, I'd tighten this to an exact-domain match (`email = '...@example.com'` style) rather than a broad substring, to avoid a false positive on some future real user whose name happens to contain "test". Not a concern at the current scale.

## Status on your other 2 questions

- **Phase 3 (payment flow doc):** not started. Stopped after Phase 2 per your explicit "stop and tell me" instruction last message.
- **Phase 4 (player test matrix + APK/logcat):** not started, same reason.
- **Blockers:** none technical — I have everything needed to do both. Only blocker is waiting for your go-ahead, which is what I'm doing now.
