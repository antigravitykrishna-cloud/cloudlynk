# Streamly v0.7.0 — Payment flow

## Overview

Streamly uses **UPI (Unified Payments Interface)** as the sole payment
method for premium subscriptions. There is no payment provider with
webhooks — the flow is fully **manual admin approval** of a UPI
transaction screenshot. This is the deliberate design for v0.7.0
because UPI apps in India (PhonePe, Google Pay, BHIM, etc.) do not
provide webhook notifications; manual review is the only reliable
verification path.

The flow is also visible to the user: they pay via their UPI app
off-platform, then upload a screenshot of the confirmation back
into Streamly. The admin reviews it and approves/rejects.

**Verified by the user on 2026-08-03**: a real ₹X test payment
completed the full cycle end-to-end (UPI → screenshot → admin
approval → plan_status='active').

---

## End-to-end flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. USER INITIATES                                                   │
│    File: app/my-subscription.tsx                                   │
│    User taps a plan card on the "My Subscription" screen.           │
│    Frontend calls getUpiPaymentUrl(amount, planName, note) from    │
│    lib/iapHelpers.ts.                                               │
│    Returns: upi://pay?pa=<UPI_ID>&pn=<merchant>&am=<amount>&tn=  │
│             <note>&cu=INR                                           │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. UPI APP OPENS                                                    │
│    React Native Linking API launches the user's default UPI app     │
│    (PhonePe, Google Pay, Paytm, BHIM, etc.) with the deep link.    │
│    User confirms the payment using their UPI PIN / biometric.        │
│    The UPI app shows a confirmation screen with:                      │
│      - Amount, payee VPA, transaction reference number (UPI TRX ID)  │
│      - Timestamp                                                    │
│    User taps "Done" — payment is now settled.                         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. SCREENSHOT UPLOAD                                                │
│    User takes a screenshot of the UPI confirmation screen.          │
│    User returns to Streamly and uploads the screenshot via the      │
│    in-app image picker.                                              │
│    File: app/my-subscription.tsx (around line 121+)                  │
│    Screenshot is uploaded to Supabase Storage bucket                  │
│    `payment-screenshots` at path `<user_id>/<timestamp>.jpg`        │
│    RLS: only the owner + admin can read; no public access.          │
│    (Per the security audit — payment-screenshots bucket verified.)   │
│                                                                       │
│    On upload success, a row is inserted into `subscription_requests`│
│    with:                                                              │
│      - user_id = auth.uid()                                          │
│      - plan_code (e.g. 'monthly', 'yearly')                         │
│      - amount_inr (decimal number)                                   │
│      - upi_transaction_id (text, the UPI TRX ID the user typed in)  │
│      - screenshot_path (the storage path above)                      │
│      - status = 'pending'                                            │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. ADMIN REVIEWS                                                     │
│    File: app/admin/subscription-requests.tsx                        │
│    Admin (user with profiles.is_admin = true) opens the             │
│    "Subscription Requests" screen.                                   │
│    Lists all subscription_requests where status = 'pending'.         │
│    For each:                                                          │
│      - View user email (joined from profiles)                        │
│      - Tap "View Screenshot" → opens signed URL of the screenshot     │
│        (1-hour expiry)                                                │
│      - Tap "Approve" → calls approve_subscription_request RPC         │
│      - Tap "Reject" → prompts for rejection reason, updates request   │
│        status to 'rejected'                                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. APPROVAL RPC (server-side)                                       │
│    RPC: approve_subscription_request(p_request_id)                  │
│    Implementation: SECURITY DEFINER function                        │
│    - Verifies caller is admin (auth.uid() IN admin users)             │
│    - Reads the subscription_request row                              │
│    - Updates the corresponding profiles row:                         │
│        plan_status = 'active'                                        │
│        plan_started_at = now()                                       │
│        plan_expires_at = now() + plan_duration_days (per plan_code)  │
│    - Updates the subscription_request status to 'approved'           │
│    - Returns void on success                                          │
│    - Throws on failure (RLS-blocked, not admin, etc.)                │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. USER SEES ACTIVE PLAN                                            │
│    User refreshes app/my-subscription.tsx (the useFocusEffect       │
│    refetches). They see:                                              │
│      - plan_status: 'active'                                         │
│      - plan_expires_at: a future date                                │
│    Anywhere in the app that checks plan_status (Explore, channel    │
│    detail, etc.) now treats them as a paid user.                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Files involved

| File | Role |
|---|---|
| `lib/iapHelpers.ts` | `getUpiPaymentUrl()` builds the `upi://pay?...` deep link from config (`UPI_ID`, `UPI_MERCHANT_NAME`) and amount. Pure function, no I/O. |
| `app/my-subscription.tsx` | User-facing page. Shows current plan, lets user upload screenshot, view their latest request. |
| `app/admin/subscription-requests.tsx` | Admin-only page. Lists pending requests, view screenshot, approve/reject. |
| `supabase/functions/generate-stream-upload/index.ts` | Not directly involved in payment. Mentioned because it shares the same auth + bucket pattern. |
| `supabase/functions/delete-account/index.ts` | Cleanup of payment data on account deletion. |
| `app.json` `extra.UPI_ID` | The merchant UPI VPA. Default `2728412a@bandhan`. Override via `EXPO_PUBLIC_UPI_ID` env var. |
| `lib/config.ts` | Reads `EXPO_PUBLIC_UPI_ID` (with fallback) and exposes it as `config.upiId`. |

---

## Database tables

| Table | Key columns | Notes |
|---|---|---|
| `subscription_requests` | `id`, `user_id`, `plan_code`, `amount_inr`, `upi_transaction_id`, `screenshot_path`, `status` ('pending' / 'approved' / 'rejected'), `rejection_reason`, `created_at`, `reviewed_at`, `reviewed_by` | Created on screenshot upload. Updated on admin approve/reject. |
| `profiles` (existing) | `plan_status`, `plan_started_at`, `plan_expires_at` | Updated by `approve_subscription_request` RPC. `plan_status` is 'free' / 'active' / 'expired' / 'cancelled'. |
| Storage bucket `payment-screenshots` | Per-user folders, one screenshot per request | RLS: owner read/write, admin read. No public access. |

---

## RPC: `approve_subscription_request`

**Signature:**
```sql
approve_subscription_request(p_request_id uuid) returns void
```

**Security:** `SECURITY DEFINER`. Checks `auth.uid()` is in the admin
user set before proceeding. Throws on permission failure.

**Effects:**
1. Verifies request is in `pending` status.
2. Reads the request, looks up the plan_code, computes
   `plan_expires_at = now() + plan_duration`.
3. Updates `profiles.plan_status = 'active'`, `plan_started_at = now()`,
   `plan_expires_at = <computed>` for the requesting user.
4. Updates `subscription_requests.status = 'approved'`,
   `reviewed_at = now()`, `reviewed_by = auth.uid()`.

**Errors:**
- `PERMISSION_DENIED` if caller is not admin.
- `REQUEST_NOT_FOUND` if no matching pending row.
- `INVALID_PLAN_CODE` if the plan_code doesn't map to a duration.

---

## RPC: `get_my_subscription_status`

**Signature:**
```sql
get_my_subscription_status() returns table (...)
```

Returns the current user's plan status and their most recent
subscription request (for showing "your last request is pending
review" UX). Used by `app/my-subscription.tsx`.

---

## Security audit notes (from `docs/security-audit-v0.7.0.md`)

- ✅ `payment-screenshots` bucket RLS verified: owner-only read/write,
  admin read, no public access. No fix needed.
- ✅ `subscription_requests` table RLS verified: users can read their
  own, admins can read all, only admins can update status. No fix
  needed.
- ✅ Edge functions (`generate-stream-upload`, `delete-account`)
  verify JWT and use user-scoped clients.
- ✅ `iapHelpers.ts` is 16 lines, clean, no TODO, no PII handling.

---

## Known limitations & v0.7.1 improvements

These are documented limitations, not bugs. They're acceptable for
v0.7.0 launch; v0.7.1 should address them.

1. **No payment provider webhook → no real-time verification.**
   Manual admin review is the only verification path. For 100+ users
   this becomes a bottleneck. v0.7.1: integrate with a payment
   aggregator (Razorpay, Cashfree) that supports webhooks.

2. **No automatic plan expiry.** Plans don't auto-expire — the
   user stays 'active' until manually changed. There's no cron job
   checking `plan_expires_at < now()`. v0.7.1: add a Supabase
   scheduled function (pg_cron) that flips expired plans to
   'expired' daily.

3. **No payment retry.** If the user's UPI transaction fails or
   they abandon mid-payment, they just see "still free" and have
   to retry the whole flow. v0.7.1: track `payment_attempts` and
   surface "your last attempt failed" in the UI.

4. **UPI ID is hardcoded in `app.json` as a fallback.** We have
   the `EXPO_PUBLIC_UPI_ID` env override but no per-environment
   config. v0.7.1: support different UPI IDs for staging vs
   production via env (e.g. test UPI for internal QA).

5. **No admin notification when a new request comes in.** Admin
   has to open the app and check. v0.7.1: send a push notification
   (Expo Push) or email when a new request is created.

6. **No payment history view for the user.** They see only the
   latest request. v0.7.1: add a "Payment History" tab.

7. **No refund flow.** If a user is wrongly charged, no
   self-serve refund path. v0.7.1: admin can mark a request as
   'refunded' and the user's plan is reverted.

8. **No fraud detection.** A user could upload any screenshot
   (including a fake). Admin visually reviews, but no automated
   cross-check with their UPI app's transaction log. v0.7.1:
   require the UPI transaction ID as text input and verify it
   matches the screenshot's TRX ID via OCR or admin comparison.

---

## Testing

- **Manual end-to-end test done by user on 2026-08-03**: UPI
  payment, screenshot upload, admin approval, plan_status update
  all worked. No regressions observed.

- **Automated test coverage**: none yet. v0.7.1: add Playwright
  E2E tests for the payment flow.
