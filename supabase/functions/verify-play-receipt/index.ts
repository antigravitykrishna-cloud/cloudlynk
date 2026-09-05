// verify-play-receipt — server-side Google Play purchase verification.
//
// Why this exists: Google Play's Payments policy requires that content
// unlocked by a purchase inside the app be verified server-side against
// Google, not trusted from whatever the client reports. `GooglePlayIapService`
// (lib/services/iap.ts) calls this function with the raw purchase token from
// react-native-iap; this function calls the Play Developer API with a
// service-account credential (never exposed to the client), acknowledges the
// purchase (Google auto-refunds anything left unacknowledged for 3 days),
// records it in `iap_purchases` (so `play-rtdn-webhook` can find this user
// again on renewal/cancellation/refund), and only then marks the user's
// profile as paid. See docs/archive/PLAY_STORE_COMPLIANCE_AUDIT.md Finding 1.
//
// Required secrets (set via `supabase secrets set`):
//   GOOGLE_SERVICE_ACCOUNT_JSON  — see supabase/functions/_shared/play-billing.ts
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — already used by other functions.
//
// This function does NOT create the Play Console products or the service
// account itself — those are Play Console / Google Cloud Console steps that
// have to be done by whoever owns the developer account. See
// BACKEND_REFERENCE.md "Payments — Google Play Billing" for the full checklist.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { getSubscriptionStatus, acknowledgeSubscription, planStatusFor } from "../_shared/play-billing.ts";

// All four Cloudlynk plans are base plans under ONE Play Console subscription
// product. Checking the product id alone proves nothing now — every purchase
// token is for `cloudlynk_premium` regardless of plan — so the trust boundary
// is: (1) the token must be for this product, and (2) the granted plan is
// whatever Google says the token's *base plan* is, never what the client
// claims. `_shared/play-billing.ts` already surfaces `basePlanId` for this.
const EXPECTED_PRODUCT_ID = "cloudlynk_premium";

// basePlanId (from Google) -> this app's plan code. Identical strings today
// (see DEFAULT_PLANS in lib/services/iap.ts), but kept as an explicit map so
// a future rename of one side doesn't silently mis-grant.
const BASE_PLAN_ID_TO_PLAN_CODE: Record<string, string> = {
  "silver-7d": "silver-7d",
  "gold-1m": "gold-1m",
  "platinum-6m": "platinum-6m",
  "diamond-1y": "diamond-1y",
};

function verifiedProductId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const lineItems = (raw as Record<string, unknown>).lineItems;
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null;
  const productId = (lineItems[0] as Record<string, unknown>)?.productId;
  return typeof productId === "string" ? productId : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("MISSING_AUTH");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) throw new Error("UNAUTHORIZED");

    // `planCode` is advisory only — the server derives the real plan below.
    const { purchaseToken, planCode: claimedPlanCode, packageName } = await req.json();
    if (!purchaseToken || !packageName) {
      return jsonResponse({ valid: false, error: "Missing purchaseToken or packageName." }, 400);
    }

    const status = await getSubscriptionStatus(packageName, purchaseToken);
    if (!status.valid) {
      return jsonResponse({ valid: false, error: "Purchase is not active according to Google Play." });
    }

    // Trust boundary. Do NOT grant what the client claimed — grant what
    // Google says this purchase token is actually for.
    const actualProductId = verifiedProductId(status.raw);
    if (actualProductId !== EXPECTED_PRODUCT_ID) {
      console.error(`verify-play-receipt: wrong product — token is for "${actualProductId}", expected "${EXPECTED_PRODUCT_ID}"`);
      return jsonResponse({ valid: false, error: "Purchase does not match this app's subscription product." }, 400);
    }

    const derivedPlanCode = status.basePlanId ? BASE_PLAN_ID_TO_PLAN_CODE[status.basePlanId] : undefined;
    if (!derivedPlanCode) {
      console.error(`verify-play-receipt: unmapped basePlanId "${status.basePlanId}" — Play Console base plans not configured, or not a subscription purchase`);
      return jsonResponse({ valid: false, error: "This purchase's plan could not be identified. If you just subscribed, try again shortly." }, 400);
    }
    if (claimedPlanCode && claimedPlanCode !== derivedPlanCode) {
      // Not fatal — grant what they actually paid for. Could be a stale UI or a manipulated client.
      console.warn(`verify-play-receipt: client claimed "${claimedPlanCode}" but Google says "${derivedPlanCode}" — granting the derived plan`);
    }
    const planCode = derivedPlanCode;

    const { planStatus, expiresAtIso } = planStatusFor(status);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Acknowledge BEFORE granting access is not required, but must happen
    // within 3 days of purchase regardless — do it here, at the one moment
    // we're guaranteed to see this purchase token for the first time.
    let acknowledged = status.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    if (!acknowledged) {
      acknowledged = await acknowledgeSubscription(packageName, actualProductId, purchaseToken);
    }

    const { error: upsertErr } = await supabaseAdmin
      .from("iap_purchases")
      .upsert({
        user_id: user.id,
        purchase_token: purchaseToken,
        product_id: actualProductId,
        plan_code: planCode,
        base_plan_id: status.basePlanId,
        package_name: packageName,
        platform: "android",
        status: planStatus === "active" ? "active" : planStatus,
        expires_at: expiresAtIso,
        acknowledged,
        last_notification_type: "INITIAL_PURCHASE",
        raw_response: status.raw,
      }, { onConflict: "purchase_token" });
    if (upsertErr) {
      console.error("verify-play-receipt: failed to record purchase:", upsertErr.message);
    }

    // Uses the service role since this must succeed regardless of RLS — the
    // caller already proved their identity above, and profiles' own
    // "protect privileged fields" trigger explicitly trusts service_role.
    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({ plan_status: planStatus, plan_expires_at: expiresAtIso })
      .eq("id", user.id);
    if (updateErr) {
      console.error("verify-play-receipt: failed to update profile:", updateErr.message);
    }

    return jsonResponse({ valid: true, planCode, expiresAt: expiresAtIso });
  } catch (err: any) {
    console.error("verify-play-receipt error:", err.message);
    const clientMessage =
      err.message === "MISSING_AUTH" || err.message === "UNAUTHORIZED" ? "Authentication required" :
      err.message === "MISSING_SERVICE_ACCOUNT" ? "Receipt verifier is not configured (GOOGLE_SERVICE_ACCOUNT_JSON missing)." :
      "Verification failed.";
    const status = err.message === "MISSING_AUTH" || err.message === "UNAUTHORIZED" ? 401 : 500;
    return jsonResponse({ valid: false, error: clientMessage }, status);
  }
});
