# Cloudflare R2 + Stream audit — 2026-09-06

Scope: credential handling for Cloudflare R2, and playback authorization for
Cloudflare Stream. Branch `harden/r2-stream`, against the 2026-09-05 handover
snapshot.

No secret values appear in this document. Where something is missing or needs
rotating it is named, never printed.

---

## Bottom line

**R2 is not integrated.** There is no R2 code in this repository — no S3
client, no signing, no endpoint, no bucket call. All object storage goes
through Supabase Storage. The R2 credentials in `.env` are live keys for a
service the app never contacts, and should be revoked rather than wired up.

**Stream had three real authorization defects**, all now fixed on this branch
and none of them yet verified against the deployed system:

| # | Severity | Defect |
|---|---|---|
| 1 | High | Premium videos were served **unsigned** until the first time someone played them — permanently, if nobody did |
| 2 | Medium-High | **Suspended and banned viewers** kept full premium feed and playback |
| 3 | Medium | The **banned manual-payment system** was still live and callable in the database |

---

## Part 1 — R2

### What the requirements asked for, and what is actually there

The brief asked to verify R2 account configuration, S3 endpoint, bucket names,
upload, read/download, delete, user isolation and account-deletion cleanup, and
to map real R2 buckets against current usage.

None of that exists to verify. Concretely:

- `package.json` has no `@aws-sdk/*`, no `aws-sdk`, no S3 or R2 client of any
  kind.
- No file in the repository constructs an R2 endpoint, signs an S3 request, or
  names an R2 bucket at runtime.
- `CLOUDFLARE_R2_ACCESS_KEY_ID` and `CLOUDFLARE_R2_SECRET_ACCESS_KEY` appear in
  exactly one place: `.env`. Nothing reads them — not the app, not a single
  edge function.
- The only `cloudflare/` code is `geo-check-worker`, unrelated to storage.

The `docs/` set describes R2 as the storage layer in a few places. That is
aspirational, or a leftover from the Streamly-era plan. It does not match the
code.

### Where storage actually happens

All four buckets are **Supabase Storage**, not R2:

| Bucket | Used by | Deleted on account deletion |
|---|---|---|
| `user-files` | `lib/storage.ts` — the user's own file storage (the 15 GB quota) | Yes |
| `channel-media` | `lib/posts.ts` — post images/thumbnails | Yes |
| `channel-videos` | `lib/channelVideos.ts` — pre-Stream channel video uploads | Yes |
| `payment-screenshots` | **retired in v57** — nothing writes to it any more | Yes (objects kept for tax retention) |

Video proper does not use any of these: it goes to **Cloudflare Stream** via
`generate-stream-upload`, and `stream_videos` tracks the UIDs.

Account-deletion cleanup in `supabase/functions/delete-account/index.ts` walks
all four buckets plus Stream, so the deletion path is complete for the storage
that is actually in use.

### Credential exposure — findings

**R2-1 (Medium) — live credentials for an unused service.**
`.env` carries `CLOUDFLARE_R2_ACCESS_KEY_ID` and
`CLOUDFLARE_R2_SECRET_ACCESS_KEY`. Nothing uses them, and this file was
distributed inside a handover ZIP. Credentials with no code path are pure
liability: nobody notices their misuse because nobody expects traffic. **Revoke
them in the Cloudflare dashboard.** If R2 is genuinely planned later, mint new
ones then.

**R2-2 (Low) — bucket name and account id are compiled into the app.**
`EXPO_PUBLIC_CLOUDFLARE_R2_BUCKET` and `EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID` carry
the `EXPO_PUBLIC_` prefix, which is precisely the marker Expo uses to decide
what gets inlined into the JS bundle. Both are therefore in the shipped AAB and
readable by anyone who unzips it. Neither is a secret — a bucket name and an
account id are not credentials — but shipping identifiers for a service the app
does not use is free attack surface with no upside. Drop
`EXPO_PUBLIC_CLOUDFLARE_R2_BUCKET` entirely. `EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID`
is likewise unread by client code.

**R2-3 (Low, fixed) — `.env.example` still documented the removed UPI flow.**
It listed `EXPO_PUBLIC_UPI_ID` with a comment explaining how it overrides
`app.json`. The UPI flow was deleted; the template still told the next
developer to configure it. Removed on this branch.

### What was verified as correct

- No secret of any kind is in `app.json`. `extra` holds only public config
  (URLs, package name, feature flags).
- No secret is read through `EXPO_PUBLIC_*` anywhere.
- `CLOUDFLARE_STREAM_API_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` are read only
  via `Deno.env.get` inside edge functions — server side, never bundled.
- `.gitignore` covers `.env`, `*.jks`, `*.keystore`, `*.p8`, `*.p12`,
  `google-play-key.json`. Verified empirically: `git add -A` on the full tree
  stages neither `.env` nor the keystore.
- No secret is written to a log. Failure paths log status codes and messages,
  never token values.

### Secrets that must exist server-side — names only

Required as **Supabase Edge Function secrets** (`npx supabase secrets set`):

| Name | Used by | Status |
|---|---|---|
| `CLOUDFLARE_STREAM_ACCOUNT_ID` | all three stream functions | present |
| `CLOUDFLARE_STREAM_API_TOKEN` | all three stream functions | present |
| `CLOUDFLARE_STREAM_CUSTOMER_CODE` | `stream-playback-token` | **verify — signed playback returns 500 without it** |
| `SUPABASE_SERVICE_ROLE_KEY` | `stream-playback-token`, `delete-account` | present |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | `verify-play-receipt` | **unverified — no Play Console account exists yet** |

Not required, and recommended for revocation: `CLOUDFLARE_R2_ACCESS_KEY_ID`,
`CLOUDFLARE_R2_SECRET_ACCESS_KEY`.

---

## Part 2 — Stream playback authorization

### Finding S-1 (High) — premium video was served unsigned until first play

**What was happening.** `generate-stream-upload` created every Cloudflare video
with the platform default, `requireSignedURLs=false`. Locking was left to
`stream-playback-token`, which asserts it lazily the first time a premium post
is played. `stream-set-access` said so explicitly at line 31:

> `free -> premium needs no Cloudflare call at all: stream-playback-token asserts requireSignedURLs on demand the first time someone plays it.`

So between a post becoming premium and its first play, the video answered
plain, unauthenticated requests at
`https://videodelivery.net/<uid>/manifest/video.m3u8`. If nobody ever played
it, that window never closed. A premium video nobody had watched yet was
world-readable to anyone holding the UID, indefinitely.

This is a direct violation of the stated requirement: *premium playback must
not rely on an unsigned/public URL*, and *do not return permanent unsigned
premium playback URLs*.

The UID is not trivially obtainable — `channel_posts.video_url` is behind RLS —
but it does not have to be guessed. It is exposed to anyone the post was ever
free for, to any admin preview, and to anything that logged it.

**Fix.** Inverted the default so the system fails safe:

1. `generate-stream-upload` now creates every video with
   `requireSignedURLs: true` and records `signed_locked: true`. Nothing is ever
   born unsigned.
2. `stream-set-access` now locks on the free → premium transition **before**
   changing `access_level`, and refuses the change if Cloudflare rejects the
   lock. This mirrors the existing premium → free ordering, which unlocks
   last. Both directions now fail towards "no premium content served unsigned".
3. The lazy assert in `stream-playback-token` stays as a backstop for videos
   uploaded before this change.

**Cost, and how it is absorbed.** Free content now depends on an unlock
succeeding, so a free post whose unlock failed would be unplayable.
`StreamService.resolveFreePlaybackUrl` handles it: plain URL first — no extra
round trip in the normal case — and if the video turns out to still be locked,
it falls back to the same signed-token endpoint, which mints a token for free
posts without requiring entitlement. `stream-playback-token` will not *acquire*
a lock on a free post, only serve one that is already locked; locking there
would break a working free video for every other client.

### Finding S-2 (Medium-High) — suspended and banned viewers kept access

**What was happening.** Three places check `account_status`, and none of them
checked the viewer:

- `channel_posts_select_v56` checks it on the post's **author**, so a banned
  creator's work disappears from feeds.
- `has_content_access` checks it on the **grantee**, so a ban kills admin
  grants.
- The paid-subscription branch checked nothing.

So a suspended or banned account holding `plan_status` `active` or `lifetime`
kept browsing the premium feed and kept minting fresh 6-hour playback tokens,
for as long as its refresh token lived. `stream-playback-token` never read the
caller's `account_status` at all. Banning somebody did not stop them watching.

**Fix.** Two layers, because RLS governs what the feed shows and the edge
function governs what Cloudflare hands over, and a ban has to mean both:

- Migration v57 replaces the policy with `channel_posts_select_v57`, adding the
  viewer's own `account_status = 'active'` to the public-feed branch.
  `author_id = auth.uid()` and the `is_admin` branch stay exempt on purpose —
  a suspended user should still see their own library (the appeal and export
  flows depend on it), and an admin's moderation view must keep working.
- `stream-playback-token` rejects a non-active caller before minting anything,
  for free content as well as premium.

### Finding S-3 (Medium) — the banned payment system was still live

Covered in the migration header and in the commit; summarised here because it
is a playback-adjacent authorization path. `subscription_requests`,
`approve_subscription_request` and `reject_subscription_request` still existed
and were still `GRANT`ed to `authenticated` — a working route to flipping
`plan_status`, and therefore premium entitlement, by hand over raw PostgREST
with no app screen involved. That is the shape Finding 1 of the Play compliance
audit describes.

v57 drops the functions, moves the table to a `retired` schema (not dropped —
it holds payment references under a 7-year tax retention), and removes the
`payment-screenshots` write policies.

### What was already correct

Worth stating plainly, because the design is sound and should not be
"simplified" by someone who has not read it:

- Entitlement is derived **server-side, twice** — once by RLS on the post read,
  once explicitly in the function. The client's opinion is never consulted;
  there is no `premium=true` input anywhere.
- Grants and subscriptions are separate systems feeding one decision, and the
  function calls `has_content_access` rather than reimplementing it — so the
  feed and the player cannot disagree.
- Errors are a single generic string for every rejection, so the response
  cannot be used to probe which posts are premium or whether one exists.
- Tokens are 6 hours, not permanent, bounding a leaked URL.
- `stream_videos` is service-role only; clients never touch it.

### Residual risk, accepted

A signed URL handed to an entitled viewer keeps working for anyone they pass it
to until it expires. This is inherent to every signed-URL video service.
Binding tokens to device or IP would narrow it and would break users who change
network mid-video. The existing code documents this decision and it stands.

Note that **revocation is not immediate**: removing a grant, banning a user or
removing a post stops the *next* token being minted, but a token already issued
stays valid for up to 6 hours. If immediate revocation is ever required, that
needs a shorter TTL, not a different design.

---

## Cloudflare dashboard settings that must be set by hand

Neither can be done from code:

1. **`CLOUDFLARE_STREAM_CUSTOMER_CODE` must be set as a Supabase secret.** It
   is the `customer-<CODE>` playback subdomain, found at Cloudflare → Stream.
   Signed playback does not work on `videodelivery.net`; without this the
   function returns 500 on every premium play. Confirm it is set before
   trusting any test result.
2. **The Stream API token needs `Stream:Edit` scope.** It must both mint
   playback tokens and set `requireSignedURLs`. An upload-only token will pass
   uploads and fail locking — which, with the v57 ordering, now correctly
   refuses to make a post premium rather than leaking it.

Also outstanding from the handover, unrelated to Cloudflare: **switch the
Google provider off** in Supabase → Authentication → Providers. The app no
longer offers Google Sign-In, but the backend still accepts it.

---

## Verification status — read this before believing any of the above

Everything in Part 2 is **implemented and type-checked, not proven against the
deployed system.** `npx tsc --noEmit` passes clean (it did not before this
branch — see the commit).

`scripts/verify-stream-access.mjs` exercises the full matrix over real HTTP
with real user JWTs:

| Case | Required |
|---|---|
| active premium subscriber | PLAYABLE |
| free user | DENIED |
| expired premium | DENIED |
| explicit grant holder | PLAYABLE |
| revoked grant holder | DENIED |
| banned user with live plan | DENIED |
| removed content | DENIED |
| unauthenticated request | DENIED |

It has **not been run.** There is no local Supabase to run it against — the
migrations cannot build a database from scratch — so it writes to production,
and it refuses to start without `--yes-write-to-production`. It creates
throwaway users, a private channel and two posts, and deletes them in a
`finally` block.

One case it cannot cover unattended: the fixtures use a Cloudflare UID that
does not exist, so an *allowed* caller is proven to have passed authorization
(it reaches Cloudflare and gets a 5xx there) but not to receive a URL that
actually plays. That last step needs a real uploaded video and a human
watching it.
