# Cloudlynk — test plan

**Rewritten 2026-09-10.** The previous version described *Streamly*, a
`PaywallModal` and a "You've used your free 30 min" screen that no longer
exist, and a three-tier Basic / Standard $4.99 / Premium $12.99 model that was
replaced by one product with four rupee-priced plans. It carried a staleness
banner for two days; following it would have had a tester hunting for screens
that were deleted.

Build under test: **versionCode 8 / 0.7.1**, `com.cloudlynk.app`, ARM-only.

> **Install on a real phone.** The release APK is `arm64-v8a` + `armeabi-v7a`
> only, so it will **not** install on a standard x86_64 emulator. That is
> deliberate — see `docs/BUILD_LOCAL.md` — but it means device testing is a
> handset, not an AVD.

---

## Known-broken before you start

Do not file these; they are understood and tracked.

| Behaviour | Why |
|---|---|
| **Any purchase fails with "Premium purchases are not available yet"** | `IAP_PROVIDER` is `noop`. Real billing turns on only after the Play Console products exist. **Nothing under §4 can pass until then.** |
| **No push notification ever arrives** | Nothing sends pushes and no device token is stored. Expiry notices are in-app only. See `docs/OPEN_ITEMS.md`. |
| **"Sign in with Google" is not shown** | Hidden until `GOOGLE_WEB_CLIENT_ID` is set. Guest and email are the live paths. |
| Signed-in free users see premium titles but cannot open them | Correct. That is the locked catalogue; tapping offers the plans. |

---

## 1. First launch, as a guest

1. Fresh install. Launch.
2. **Expect:** an 18+ age gate before anything else. Confirm.
3. **Expect:** the app opens on **Explore**, not Cloud.
4. **Expect:** a five-tab bar — Cloud · Feed · Explore · Channels · Profile.
5. Content is visible without any account. Premium items carry a **PREMIUM**
   badge.
6. Tap a **free** item → it plays.
7. Tap a **premium** item → a prompt offering *Continue as guest*, *See Premium
   plans*, *Sign up free*. It must **not** open a player.

## 2. Guest browsing (this is where the app used to wall you out)

1. **Feed tab** → a chronological list. Locked rows show a padlock and
   "Premium · subscribe to watch".
2. **Channels tab** → the channel list is **visible**, with member and content
   counts. It must not say "Create free account" and nothing else.
3. Tap any channel → *"Create an account first"*.
4. Turn airplane mode on, pull to refresh each of Feed, Explore, Channels.
   **Expect:** *"Couldn't load…"* plus a **Try again** button — **not** "No
   content available". This is the difference between empty and broken.

## 3. Account creation (one tap, no password)

1. Profile → sign in, or tap any gated action.
2. **Expect:** *Continue as guest* / *Continue with email*. **No password
   field anywhere.**
3. Choose email, enter an address, receive a **6-digit code**, enter it.
4. **Expect:** birth year + policy acceptance on first sign-in only.
5. **Expect:** landing on Explore, signed in.
6. **Signed in but not subscribed:** premium titles are still **visible and
   locked**. If they vanished, that is a regression.

## 4. Subscription — blocked until Play Billing is live

Run only after `IAP_PROVIDER` is `google_play` and the four base plans are
**Activated** in Play Console.

1. Premium screen shows Silver ₹199 / Gold ₹259 / Platinum ₹599 / Diamond ₹999.
2. Buy the cheapest with a licence-tester account.
3. **Expect:** a success haptic, then premium content plays.
4. Confirm in Supabase: `plan_status = 'active'`, `plan_expires_at` set.
5. **My Subscription** shows ACTIVE and the correct end date.
6. **Restore:** uninstall, reinstall, sign in, Premium → *"Already subscribed?
   Restore purchase"* → access returns **without paying again**.

### Expiry

Fastest check without waiting out a term — set the date into the past:

```sql
select public.apply_play_entitlement(
  (select id from public.profiles where email = 'TESTER@example.com'),
  'active', now() - interval '1 day'
);
```

1. **Immediately:** premium content stops playing. Access is denied by the
   date, not by the hourly sweep.
2. **My Subscription** reads **EXPIRED**, not ACTIVE. (It used to say ACTIVE
   with a past date — that was a bug, retest it.)
3. Within the hour, or by running `select public.expire_lapsed_plans();` —
   `plan_status` becomes `expired` and a notification appears in the bell.
4. Tap that notification → it opens the **plans screen**. It must not do
   nothing.

## 5. Admin panel — your client's main surface, test it hardest

Sign in as an admin account (`is_admin = true`; see `docs/ADMIN_ACCESS.md`),
then **Profile → scroll to the admin section**.

Open **every** screen and confirm it loads: Admin Panel, Pending Channels,
Pending Channel Content, Channel Activity, Reports, User Approvals,
**Subscribers**, Content & Access, Upload Content, Audit Log.

1. **Approve a channel** → expect a success haptic, the row leaves the list,
   and the channel goes live for users.
2. **Reject one** → a distinctly different haptic; the row leaves.
3. **Subscribers** → tabs for Expired / Ending / Active / Cancelled / Free with
   counts. It is **read-only by design** — there is no button to change a
   plan, and that is correct. `plan_status` is written by the receipt
   verifier, the RTDN webhook and the sweeper; a fourth writer would race them.
4. **Airplane mode, then open any admin screen.** **Expect:** *"Could not
   load…"*. It must **not** show an empty queue — an admin who believes there
   is nothing to review stops checking while the queue fills.
5. **Content & Access** → change a post's access level, grant one user access
   to one post, revoke it.

## 6. Account deletion — Play requires both routes

1. **In-app:** Profile → Delete Account → confirm.
2. **Expect:** signed out, and the account is gone. Verify in Supabase that
   the `profiles` row and the `auth.users` row are both absent.
3. **Verify the media is gone too** — the user's videos should no longer exist
   in Cloudflare Stream. This is the step most likely to be skipped and the
   one a Data Safety audit asks about.
4. **Web route:** <https://thecloudlynk.com/delete-account.html> in a browser,
   with the app uninstalled. It must complete without a CORS error.

> Use a throwaway account that owns at least one uploaded file and one video.
> Deleting an account with no content proves almost nothing.

## 7. Interaction polish (added 2026-09-10)

1. Press and hold any Feed row → it **scales down**, and springs back on
   release.
2. Open Feed or Channels → rows **fade in with a slight stagger**, not all at
   once.
3. Approve/reject in admin, and join a channel → each gives a **haptic**, and
   success feels different from failure.
4. Explore hero for a title with no artwork shows an **icon**, not a large
   empty rectangle.

## 8. Before submitting to Play

- [ ] A real purchase completed on the internal track
- [ ] `versionCode` bumped past anything already uploaded
- [ ] RTDN webhook connected to Pub/Sub
- [ ] Data Safety form filled from `docs/play-store-data-safety.md`
- [ ] Reviewer access set up — `docs/PLAY_APP_ACCESS.md`
- [ ] Store screenshots reshot against **real content** (the current database
      is test data: channels named "QA Test", titles that are raw filenames)
