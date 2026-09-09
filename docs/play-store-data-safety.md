# Play Console — Data Safety answer sheet

**App:** Cloudlynk · **Package:** `com.cloudlynk.app` · **Audited:** 2026-09-10

Rewritten from scratch. The previous version of this file described **Streamly**,
package `com.streamly.cloud`, and stated *"v0.7.0 has no in-app purchase / no
Play Billing… the Payment section is NOT required."* All three are now false:
the app is Cloudlynk, the package is `com.cloudlynk.app`, and Google Play
Billing is the payment path (`lib/services/iap.ts`, `verify-play-receipt`,
`play-rtdn-webhook`). Filing the old answers would have been a false Data
Safety declaration.

Every answer below is traced to the code or schema that produces it. **Where an
answer says "No", it is because the corresponding code path was checked and
found absent — not assumed.**

> Re-audit this file whenever a dependency, permission, or table is added.
> A Data Safety form that does not match runtime behaviour is one of the
> most common causes of removal, and it is checked by automated scanning.

---

## 1. Data collected

Answer **Yes** to "Does your app collect or share any of the required user data
types?"

| Play category | Data type | Collected | Shared | Required | Purpose | Where it lives |
|---|---|---|---|---|---|---|
| Personal info | **Email address** | Yes | No | Required | Account creation, sign-in | `auth.users.email`, `profiles.email` |
| Personal info | **Name** | Yes | No | **Optional** | Display name on posts/profile | `profiles.full_name` |
| Personal info | **Other info** (birth year) | Yes | No | Required | 18+ age gate for content rating | `profiles.birth_year`, set once via `set_birth_year` (v51) |
| Photos and videos | **Photos**, **Videos** | Yes | No | Optional | User's own cloud storage + channel content they publish | `files`, `channel_posts`, `channel_videos`, `stream_videos`, `profiles.avatar_url` |
| Files and docs | **Files and docs** | Yes | No | Optional | The cloud-storage feature itself | `files` + `user-files` bucket |
| App activity | **App interactions** | Yes | No | Optional | Watch history, resume position, view counts | `watch_history`, `channel_posts.view_count` |
| Financial info | **Purchase history** | Yes | No | Optional | Granting and restoring the subscription | `iap_purchases`; token from Play Billing |
| Device or other IDs | **Device or other IDs** | Yes | No | Optional | Push notifications only | `profiles.fcm_token` — an Expo push token ([lib/notifications.ts:156](../lib/notifications.ts:156)) |

**Ephemeral, so declared as not collected:** search terms. `lib/search.ts` runs
`SELECT` queries against `channels` and `channel_posts` and persists nothing —
there is no search-history table.

---

## 2. Data explicitly NOT collected

State **No** for all of these. Each was verified, not assumed:

| Data type | Why "No" |
|---|---|
| **Location** (precise or approximate) | No location permission in the merged manifest. The optional geo-check Worker reads `request.cf.country` at Cloudflare's edge and stores nothing ([hooks/useGeoCheck.ts](../hooks/useGeoCheck.ts)); `GEO_CHECK_WORKER_URL` is currently empty in `app.json`, so it is not even called. |
| **Advertising ID** | AdMob is linked but **no ad is ever rendered** (`lib/adsConfig.ts`), and `AD_ID` + the three `ACCESS_ADSERVICES_*` permissions are stripped from the merged manifest by `plugins/withRemoveAndroidPermissions.js`. **If ads are enabled later this answer must change to Yes.** |
| **Crash logs / diagnostics** | Sentry is a code path only — `SENTRY_DSN` is empty in `app.json`, so `isSentryLive()` is false and nothing initialises. |
| **Audio / voice** | `RECORD_AUDIO` removed; no recording API is called. |
| **Camera capture** | `CAMERA` removed; only `launchImageLibraryAsync` is used (`lib/posts.ts`, `lib/channelVideos.ts`, `lib/storage.ts`). |
| Contacts, Calendar, SMS, Call logs, Health, Messages, Web browsing | No permission, no API, no table. |

---

## 3. Data sharing

**Nothing is shared with third parties.** No analytics SDK, no ad network
serving, no data broker, no advertising partner.

Processors (Play does not count these as "sharing" — they act on our
instructions):

- **Supabase** — database, auth, storage, edge functions
- **Cloudflare** — Stream (video), R2 (object storage)
- **Google Play Billing** — payment processing; **we never see card details**
- **Expo push service** — delivery of the notification payload

---

## 4. Security practices

| Question | Answer | Evidence |
|---|---|---|
| Is all user data encrypted in transit? | **Yes** | Every endpoint is HTTPS/TLS — Supabase, Cloudflare Stream/R2, Expo push |
| Can users request data deletion? | **Yes** | Both paths below |
| Is data encrypted at rest? | **Yes** | Supabase Postgres + Storage encrypt at rest by default |
| Independent security review? | **No** | Do not claim one |
| Committed to Play Families Policy? | **No** | 18+ app |

### Account deletion — both required routes work

Play requires an in-app route **and** a web route reachable without installing
the app.

1. **In-app:** Profile → Delete Account → `delete-account` edge function.
2. **Web:** <https://thecloudlynk.com/delete-account.html> → same function.

Both were broken until 2026-09-10 and were fixed together:

- **v76** — eight attribution foreign keys (`approved_by`, `reviewed_by`,
  `granted_by`, `admin_id`) were `ON DELETE NO ACTION`, so `deleteUser()` failed
  for any account that had ever approved, reviewed or granted anything.
  Now `ON DELETE SET NULL`. Verified by running the real delete inside a
  transaction that then rolls back.
- **CORS** — the function returned an `Access-Control-Allow-Origin` of the
  Supabase project URL, so the browser refused every call from
  `thecloudlynk.com`. The site origins are now allow-listed in code
  (`supabase/functions/delete-account/index.ts`) so an unset env var cannot
  break the compliance path again. The mobile app was never affected —
  React Native sends no `Origin` header.

**What deletion removes:** auth user, profile, files, posts, channels owned,
channel memberships, watch history, notifications, transfers, stream videos,
plus the underlying objects in Supabase Storage and Cloudflare Stream.

**What deletion deliberately retains:** moderation records (`admin_audit_log`,
`content_reports`) and other users' posts that the deleted account had
approved — with the personal link nulled. These are records about the service,
not the user's personal data, and cascading them would delete other people's
content.

---

## 5. Declaration checklist before submitting

- [ ] Data Safety form filled from §1–§4 above
- [ ] Deletion URL entered: `https://thecloudlynk.com/delete-account.html`
- [ ] Privacy policy URL entered: `https://thecloudlynk.com/privacy-policy`
- [ ] Content rating questionnaire completed (18+; UGC present)
- [ ] Target audience: **18 and over** — must match the birth-year gate
- [ ] App access: reviewer credentials supplied (the app allows guest browsing,
      but premium content needs an account **and** a subscription — review
      cannot see it otherwise). See `docs/PLAY_APP_ACCESS.md`.
- [ ] If ads are ever enabled: revisit the Advertising ID row in §2,
      the permission list in `plugins/withRemoveAndroidPermissions.js`,
      and replace the Google test unit IDs in `app.json`
