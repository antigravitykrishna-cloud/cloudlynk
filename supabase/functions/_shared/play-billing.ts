// Shared Google Play Developer API client — used by both `verify-play-receipt`
// (purchase-time verification, called from the app) and `play-rtdn-webhook`
// (server-to-server renewal/cancellation/refund notifications from Google).
//
// Keeping this in one place means both call paths agree on what "active"
// means for a subscription, and both share the same service-account auth —
// no risk of the two functions drifting apart on entitlement logic.
//
// Required secret (set via `supabase secrets set`):
//   GOOGLE_SERVICE_ACCOUNT_JSON — full JSON key for a service account granted
//   "Manage orders and subscriptions" access in Play Console > Users and
//   permissions, with Android Publisher API enabled in the matching GCP
//   project.

import { getAccessToken } from "./google-auth.ts";
export { getAccessToken };

export interface PlaySubscriptionStatus {
  /** True when the user should currently have access. */
  valid: boolean;
  expiryTimeMillis: number | null;
  subscriptionState: string | null;
  /** 'ACKNOWLEDGEMENT_STATE_PENDING' means Google will auto-refund if not acknowledged within 3 days. */
  acknowledgementState: string | null;
  /** The base plan / offer id the user is actually on, for analytics. */
  basePlanId: string | null;
  raw: unknown;
}

// States where the user must NOT retain access, even if `expiryTime` hasn't
// technically passed yet (a paused or payment-failed subscription is not a
// paid one; a revoked subscription is a refund and access must be pulled
// immediately per Play's Payments policy).
const NEVER_VALID_STATES = new Set([
  "SUBSCRIPTION_STATE_ON_HOLD",
  "SUBSCRIPTION_STATE_PAUSED",
  "SUBSCRIPTION_STATE_REVOKED",
  "SUBSCRIPTION_STATE_EXPIRED",
  "SUBSCRIPTION_STATE_PENDING",
]);

/**
 * Fetch the authoritative subscription status from Google Play.
 *
 * Note on `SUBSCRIPTION_STATE_CANCELED`: this means auto-renew was turned
 * off, NOT that access ends immediately — the user paid for a period and
 * keeps access until `expiryTime`, same as canceling any other subscription.
 * We treat it as valid as long as `expiryTime` is still in the future.
 */
export async function getSubscriptionStatus(packageName: string, purchaseToken: string): Promise<PlaySubscriptionStatus> {
  const accessToken = await getAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await resp.json();
  if (!resp.ok) {
    return { valid: false, expiryTimeMillis: null, subscriptionState: null, acknowledgementState: null, basePlanId: null, raw: json };
  }

  const state: string | undefined = json.subscriptionState;
  const lineItem = json.lineItems?.[0];
  const expiryMs = lineItem?.expiryTime ? new Date(lineItem.expiryTime).getTime() : null;
  const notExpired = expiryMs === null || expiryMs > Date.now();
  const valid = !!state && !NEVER_VALID_STATES.has(state) && notExpired;
  // basePlanId identifies which offer the user is actually on (present
  // whether they're on an auto-renewing or prepaid base plan) — informational
  // only, not used for the valid/invalid decision above.
  const basePlanId: string | null = lineItem?.offerDetails?.basePlanId ?? null;

  return {
    valid,
    expiryTimeMillis: expiryMs,
    subscriptionState: state ?? null,
    acknowledgementState: json.acknowledgementState ?? null,
    basePlanId,
    raw: json,
  };
}

/**
 * Acknowledge a subscription purchase. Google auto-refunds any subscription
 * purchase left unacknowledged for 3 days — this must be called once per
 * purchase (not per renewal) after we've decided to grant access.
 * Safe to call even if already acknowledged (Google just returns an error we
 * can ignore) since we check `acknowledgementState` before calling in practice.
 */
export async function acknowledgeSubscription(packageName: string, subscriptionId: string, purchaseToken: string): Promise<boolean> {
  const accessToken = await getAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(subscriptionId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const resp = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: "{}" });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("acknowledgeSubscription failed:", resp.status, text);
    return false;
  }
  return true;
}

/** Maps a Play subscription status to this app's `profiles.plan_status` values. */
export function planStatusFor(status: PlaySubscriptionStatus): { planStatus: string; expiresAtIso: string | null } {
  if (status.valid) {
    return { planStatus: "active", expiresAtIso: status.expiryTimeMillis ? new Date(status.expiryTimeMillis).toISOString() : null };
  }
  if (status.subscriptionState === "SUBSCRIPTION_STATE_REVOKED") {
    return { planStatus: "cancelled", expiresAtIso: null };
  }
  return { planStatus: "expired", expiresAtIso: status.expiryTimeMillis ? new Date(status.expiryTimeMillis).toISOString() : null };
}
