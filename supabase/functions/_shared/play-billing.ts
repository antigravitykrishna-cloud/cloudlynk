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

// ── Minimal Google service-account OAuth2 (JWT bearer grant), no external deps ──

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const contents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(contents), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

let cachedToken: { token: string; expiresAtMs: number } | null = null;

export async function getAccessToken(): Promise<string> {
  // Small in-memory cache so a burst of RTDN calls (or a purchase followed
  // immediately by its own RTDN) doesn't mint a fresh token for every call.
  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("MISSING_SERVICE_ACCOUNT");
  const sa = JSON.parse(raw) as { client_email: string; private_key: string };

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = new TextEncoder();
  const unsigned = `${base64url(enc.encode(JSON.stringify(header)))}.${base64url(enc.encode(JSON.stringify(claim)))}`;
  const key = await importPrivateKey(sa.private_key);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned)));
  const jwt = `${unsigned}.${base64url(signature)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error(`TOKEN_EXCHANGE_FAILED: ${JSON.stringify(json)}`);
  }
  cachedToken = { token: json.access_token as string, expiresAtMs: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

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
