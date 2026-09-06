# AAB readiness — what stands between you and Play

**An AAB exists and builds cleanly.** It is not uploadable, for one reason:
no keystore passwords, so it is debug-signed.

```
C:\Users\MIT\Downloads\Cloudlynk-v0.7.1-DEBUGSIGNED-not-for-play.aab   93.8 MB
```

I can't call this "100% perfect and flawless" and mean it. The app has never
run on a device, four migrations are undeployed, and three of the seven
blockers below are outside anything code can fix. What follows is what is
actually true.

---

## The artifact, audited

`node scripts/audit-apk.mjs <file>` — reads the bundle itself, not the config
that produced it.

| Check | AAB | APK |
|---|---|---|
| Signed | ✅ JAR v1 | ✅ APK Signing Block v2/v3 |
| **Not debug-signed** | ❌ `CN=Android Debug` | ❌ `CN=Android Debug` |
| Package | ✅ `com.cloudlynk.app` | ✅ |
| versionName / versionCode | ✅ 0.7.1 / 8 | ✅ |
| targetSdk ≥ 36 | ✅ 36 | ✅ |
| Supabase URL is production | ✅ | ✅ |
| Service-role key absent | ✅ | ✅ |
| Cloudflare token absent | ✅ | ✅ |
| UPI screenshot flow absent | ✅ | ✅ |
| Jollify / Streamly identity | ✅ absent | ✅ absent |
| **expo-dev-client** | ❌ in `classes5/6.dex` | ❌ same |

Two entries need explaining rather than just fixing.

### Debug signing

The only thing making this AAB unuploadable. Put the passwords in
`C:\Users\MIT\.gradle\gradle.properties` (**not** `android/gradle.properties`,
which is tracked by git) and rerun:

```bash
cd C:\cloudlynk\android && .\gradlew bundleRelease -PCLOUDLYNK_REQUIRE_RELEASE_SIGNING=true
```

The flag turns a missing keystore into a build failure instead of a
debug-signed artifact that looks fine until Play rejects it.

Where to find them: whoever built `apk/cloudlynk-v0.7.0-release.apk` had them
working — that APK's certificate reads `CN=Cloudlynk, O=Cloudlynk, C=IN`, which
is not this project's debug key.

### expo-dev-client — a correction

**I previously told you this was not in the release build. That was wrong.** I
checked with `strings`, which needs four printable characters in sequence and
missed it. Inflating the dex and searching directly finds it in `classes5.dex`
and `classes6.dex`, in both artifacts.

What I do **not** know is whether those are live classes or the release stubs
Expo ships. The manifest is clean — no `SYSTEM_ALERT_WINDOW`, which was the
concrete risk the compliance audit raised about dev-client — so the known
danger is absent either way.

Not changed, deliberately: moving `expo-dev-client` to `devDependencies`
unattended could break autolinking, and I would not have been able to tell you
until you woke up. It is a five-minute experiment with a rebuild to confirm.

---

## Fixed while you slept

**Three live production leaks**, found by pointing the anon key at production
with no session — which is what anyone holding your APK has, since the anon key
ships inside it.

| Leak | Extent |
|---|---|
| `stream_videos` readable by `anon` | **48 rows** — every Cloudflare UID mapped to its uploader and post, plus `signed_locked` telling you which are playable unsigned |
| `channel_posts.video_url` | readable — **13 free posts** streamable with no account |
| `channel_posts.media_url` | readable |

`BACKEND_REFERENCE` calls `stream_videos` "service-role only; clients never
touch it". The app side is true, but that was being relied on as the control
and it isn't one — RLS was never enabled and `anon` held a grant.

Migration **v62** fixes it, and ends with a guard that refuses to apply if RLS
is off on any table this project grants `anon` access to. Verify any time with
`node scripts/verify-guest-access.mjs`.

**Guest states for Cloud, Channels and Profile.** v61 opened every tab to
visitors but only Explore had content, so the other three showed a blank
screen — the first thing a tester would report as broken.

---

## The seven blockers

Ordered by how long they take. **1 and 2 are the long poles and both are pure
waiting — start them first.**

| # | Blocker | Who | Time |
|---|---|---|---|
| 1 | **Play Console account** ($25 + identity verification) | You | **Days–weeks** |
| 2 | Payment gateway merchant KYC, if you still want UPI | You | Days |
| 3 | **Keystore passwords** | Ask the v0.7.0 builder | Minutes |
| 4 | **`npx supabase login`** | You | 5 min |
| 5 | `cloudlynk://reset-password` in Redirect URLs | You | 2 min |
| 6 | Verify `CLOUDFLARE_STREAM_CUSTOMER_CODE` is set | You | 2 min |
| 7 | Decide on expo-dev-client | Together | 5 min |

### #4 is worth more than its five minutes

One `supabase login` unblocks **six** separate things, all written and waiting:

- **v58** — paid subscriptions currently never activate. Money is taken and
  entitlement silently reverts.
- **v57** — premium videos served unsigned until first play; banned users keep
  full access
- **v59** — admin edit/replace post
- **v60** — suspended admins keep their powers
- **v61** — guest browsing (until then, guests see an **empty Explore**)
- **v62** — the three leaks above

Deploy order and verification queries: `docs/DEPLOY_V57_V58.md`.

---

## Tell your client, so it isn't filed as a bug

Testing the current APK:

- **"Continue as guest" leads to an empty Explore.** v61 isn't deployed. Have
  them sign in instead.
- **Buying Premium says "not available yet."** `IAP_PROVIDER: noop`, no Play
  Console account.
- **Admin → Edit post / Replace video** says its migration isn't deployed.
- **`admin@cloudlynk.app` / `admin123` is not admin yet** — the v58 bug reverted
  the flag. One SQL statement fixes it; see below.

Everything else runs against the live backend: signup, Explore, channels,
15 GB storage, free playback, premium gating, report/block, account deletion,
and the rest of the admin panel.

### Making the admin account admin

Supabase → SQL Editor. **Both statements in one execution** —
`set_config(..., true)` is transaction-local, so splitting them puts you back
where you started:

```sql
select set_config('app.trusted_update', 'true', true);
update public.profiles
set is_admin = true, account_status = 'active',
    approval_status = 'approved', full_name = 'Cloudlynk Admin'
where id = 'b78040c4-8dfd-44ba-b771-8f44a626cdf9';
```

---

## Still not verified

Being explicit, because several things read as finished and are not:

- **Nothing is deployed.** v57–v62 are written, reviewed, unapplied.
- **The app has never run on a device.** `tsc` is clean and it bundles; neither
  can see a layout break or a contrast problem.
- **Guest browsing has never been exercised** end to end. The RLS is written and
  the client is written; they have never met.
- **Password reset has never been tested.** It also needs #5 or the link is
  inert.
- **The access matrix is 5/8 proven.** Three cases could not be established
  until v58 lands.
- **`admin123`** is fine for a demo and should not survive contact with Meta
  ads — that account can read every user's email address.
