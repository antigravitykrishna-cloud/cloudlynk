# Edge functions

Server code that the app cannot be trusted to run itself: anything that holds a secret (Cloudflare,
Google Play, payment gateways), grants Premium, or must work without the app installed. Each folder
is one [Supabase Edge Function](https://supabase.com/docs/guides/functions) (Deno). Its `index.ts`
opens with a header saying what it does, who calls it, and the request and response.

## Functions

| Function                 | Called by                       | Auth                    | Does                                                               |
| ------------------------ | ------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| `generate-stream-upload` | app (upload)                    | session, checked inside | One-time Cloudflare Stream upload URL; video is born locked        |
| `stream-playback-token`  | app (player)                    | session                 | Signed playback URL, after checking the caller may watch the post  |
| `stream-set-access`      | app (admin)                     | admin session           | Changes a post's free / premium level, locking the video first     |
| `admin-replace-video`    | app (admin)                     | admin session           | Swaps the video behind a post, keeping its id and access grants    |
| `verify-play-receipt`    | app (Google Play purchase)      | session                 | Verifies a Play purchase with Google, then grants the plan         |
| `play-rtdn-webhook`      | Google Pub/Sub                  | shared secret in URL    | Renewals, cancellations and refunds from Google Play               |
| `payments`               | app, Razorpay, Sabpaisa         | per route               | UPI / Razorpay / Sabpaisa orders, verification, webhooks           |
| `delete-account`         | app, `account-deletion` page    | session                 | Deletes the caller's rows, files, videos, then the auth user       |
| `account-deletion`       | browser (Play's deletion link)  | none (public page)      | Web page: email sign-in, then calls `delete-account`               |
| `legal-pages`            | browser (Play listing, the app) | none (public pages)     | Hosts the privacy policy, terms, guidelines, refund and copyright  |

Which functions skip the gateway's JWT check, and why, is declared in [`../config.toml`](../config.toml).

## Shared code (`_shared/`)

| Module                 | What it gives a function                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `http.ts`              | `servePost` (CORS preflight, POST only, `HttpError` -> JSON), `readJson`, `jsonResponse`, CORS |
| `supabase.ts`          | `userClient` (acts as the caller, RLS applies), `adminClient` (service role), `requireCaller`, `requireAdmin` |
| `cloudflare-stream.ts` | `streamApi` for this account's Stream API, `lockVideo` (requireSignedURLs)                     |
| `play-billing.ts`      | Google Play subscription status and acknowledgement, mapped to our plan statuses               |
| `google-auth.ts`       | Service-account access token for Google APIs                                                   |
| `gateways.ts`          | Razorpay and Sabpaisa clients, and Google's external-transaction report                        |
| `meta-capi.ts`         | Reports a confirmed purchase to Meta's Conversions API                                         |

A function reads top to bottom as **parse -> authorize -> act -> respond**. Anything the caller
should see is thrown as an `HttpError(status, message)`; anything else is logged and answered with
the function's generic `fallbackError`, so internals never reach the client.

Use `userClient` (via `requireCaller`) for anything the caller could do in the app, so row level
security and the database's own admin checks apply. Reach for `adminClient` only for what the
caller may not do directly, and say why at the call site.

## Secrets

Set with `npx supabase secrets set NAME=value`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase.

| Secret                                                        | Used by                                         |
| ------------------------------------------------------------- | ----------------------------------------------- |
| `CLOUDFLARE_STREAM_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN` | Stream functions, `delete-account`              |
| `CLOUDFLARE_STREAM_CUSTOMER_CODE`                             | `stream-playback-token`                         |
| `GOOGLE_SERVICE_ACCOUNT_JSON`                                 | `verify-play-receipt`, `play-rtdn-webhook`, `payments` |
| `GOOGLE_PLAY_PACKAGE_NAME`, `RTDN_SHARED_SECRET`              | `play-rtdn-webhook`                             |
| `RAZORPAY_*`, `SABPAISA_*`, `PAYMENT_GST_PERCENT`             | `payments` (listed in `_shared/gateways.ts`)    |
| `META_DATASET_ID`, `META_CAPI_TOKEN`                          | `payments` (listed in `_shared/meta-capi.ts`)   |
| `ALLOWED_ORIGINS`, `APP_ORIGIN`                               | browser-facing functions (CORS)                 |

## Working on a function

```sh
npm run functions:check                       # deno check every function (CI runs this)
npx supabase functions serve <name>           # run locally against `supabase start`
npx supabase functions deploy <name>          # deploy one; JWT settings come from config.toml
```
