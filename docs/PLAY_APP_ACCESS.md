# Play Console → App access

**Why this matters:** Cloudlynk lets guests browse, but the thing the app is
*for* — full premium content — needs an account **and** an active subscription.
A reviewer who signs up and sees only locked thumbnails will conclude the app
doesn't work, and "we couldn't access the functionality" is one of the fastest
rejections there is.

So **App access must be set to "All or some functionality is restricted"** and
you must supply working credentials.

---

## What to enter in Play Console

**App content → App access → All or some functionality is restricted.**

Add one instruction set:

| Field | Value |
|---|---|
| Name | Reviewer account (premium) |
| Username | *the reviewer email you create below* |
| Password | *leave blank — see the note* |
| Any other instructions | Paste the block below |

### Instructions to paste

```
This app does not use passwords. Sign-in is a one-time 6-digit code
emailed to the address.

1. Open the app. On the login screen tap "Continue with email".
2. Enter: <REVIEWER_EMAIL>
3. A 6-digit code is emailed. Enter it to sign in.
4. First launch asks for birth year (18+ age gate) and policy acceptance.

This reviewer account already has an active subscription, so all premium
content is unlocked -- no purchase is needed to review the app.

Guest access: tapping "Continue as guest" on the login screen browses
channels and free content with no account at all.
```

> **The password field:** there is no password to give. Put the explanation in
> the instructions box and leave the password blank (or type `N/A — one-time
> code, see instructions`). Do **not** invent a password; a reviewer who tries
> it and fails will reject the submission.

---

## The one thing you must do yourself

**The reviewer needs a mailbox you can read**, because you have to fetch the
6-digit code and there is no way around that. A reviewer cannot receive it.

This is the standard problem with OTP-only auth and Play review. Pick one:

### Option A — an address you control (simplest)

Create a dedicated address, e.g. `playreview@thecloudlynk.com` or a Gmail
alias. Sign in once yourself in the app to create the profile row, then grant
the subscription:

```sql
select public.apply_play_entitlement(
  (select id from public.profiles where email = 'playreview@example.com'),
  'active',
  now() + interval '365 days'
);
```

Then in the instructions box, add: *"If the code cannot be received, contact
&lt;your support email&gt; and it will be forwarded within the hour."*

Reviewers do accept this, but it adds latency and risk.

### Option B — a review bypass (more reliable, small code change)

Add a fixed test address that Supabase Auth accepts with a static code.
Supabase supports this natively: **Authentication → Providers → Email → Test
OTP**, which maps an address to a fixed code with no email sent. Then the
reviewer types the code straight from your instructions.

This is the recommended route — it is a first-party Supabase feature, it is
not a hidden backdoor in your app, and it removes the mailbox dependency
entirely. Set it up, then put the fixed code in the instructions box.

> Remove the mapping when the app is live, or keep it scoped to a single
> address you control. It is a real credential.

---

## Related declarations that must agree

| Declaration | Value | Must match |
|---|---|---|
| Target audience | 18 and over | The birth-year gate in `complete-profile` |
| Content rating | Complete the questionnaire; declare UGC | The channel/post system |
| Data safety | See `docs/play-store-data-safety.md` | Actual runtime behaviour |
| Account deletion URL | `https://thecloudlynk.com/delete-account.html` | Verified working 2026-09-10 |
| Privacy policy | `https://thecloudlynk.com/privacy-policy` | Live |

If any two of these disagree, review flags it — the checks are automated and
cross-referenced.
