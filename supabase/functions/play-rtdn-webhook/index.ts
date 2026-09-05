// play-rtdn-webhook — receives Google Play Real-time Developer Notifications
// (RTDN) for subscriptions: renewals, cancellations, refunds, grace periods,
// account holds, pauses. Without this, a subscription that's canceled or
// refunded mid-period keeps `profiles.plan_status = 'active'` until the user
// happens to reopen the app and trigger some other check — Play's Payments
// policy expects entitlements to be "appropriately fulfilled or revoked
// based on the status of Google Play purchases", which in practice means
// listening to RTDN (Google's own recommendation), not polling.
//
// This function does NOT try to interpret `notificationType` itself — per
// Google's guidance, every notification just means "something changed, go
// re-check the authoritative state," so it always re-fetches the
// subscription from the Play Developer API and writes down whatever that
// says. This is simpler and more correct than hand-rolling per-type logic.
//
// ── One-time setup this function needs (all outside this codebase) ──
//   1. In the Google Cloud project linked to your Play Console app, create a
//      Pub/Sub topic (e.g. `play-rtdn`) and grant
//      `google-play-developer-notifications@system.gserviceaccount.com`
//      the "Pub/Sub Publisher" role on it (Play Console does this for you if
//      you link the topic from Play Console > Monetize > Monetization setup
//      > Real-time developer notifications).
//   2. Create a Pub/Sub PUSH subscription on that topic, with the endpoint
//      set to this function's URL + `?secret=<RTDN_SHARED_SECRET>` (see
//      below) — e.g.
//      https://<project-ref>.supabase.co/functions/v1/play-rtdn-webhook?secret=...
//   3. Deploy this function with `--no-verify-jwt` (Pub/Sub cannot send a
//      Supabase auth token; the shared secret below is what authenticates
//      it instead):
//        npx supabase functions deploy play-rtdn-webhook --no-verify-jwt
//   4. Set two additional secrets:
//        npx supabase secrets set RTDN_SHARED_SECRET=<a long random string>
//        npx supabase secrets set GOOGLE_PLAY_PACKAGE_NAME=com.cloudlynk.app
//      (GOOGLE_SERVICE_ACCOUNT_JSON is shared with verify-play-receipt and
//      should already be set.)
//   Full checklist: BACKEND_REFERENCE.md "Payments — Google Play Billing".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSubscriptionStatus, planStatusFor } from "../_shared/play-billing.ts";

interface PubSubPushBody {
  message?: { data?: string; messageId?: string; attributes?: Record<string, string> };
  subscription?: string;
}

interface DeveloperNotification {
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: { version: string; notificationType: number; purchaseToken: string };
  testNotification?: { version: string };
  voidedPurchaseNotification?: { purchaseToken: string; orderId: string; productType: number; refundType: number };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Pub/Sub push requests can't carry a Supabase JWT — authenticate with a
  // shared secret in the query string instead (set on the push subscription
  // URL in step 2 above, never logged or echoed back).
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expectedSecret = Deno.env.get("RTDN_SHARED_SECRET");
  if (!expectedSecret || secret !== expectedSecret) {
    // Wrong/missing secret: refuse, but don't tell a prober anything useful.
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const body = (await req.json()) as PubSubPushBody;
    const dataB64 = body.message?.data;
    if (!dataB64) {
      // Malformed push — ack it anyway so Pub/Sub doesn't retry forever on a
      // message it will never be able to parse.
      return new Response("OK (no data)", { status: 200 });
    }

    const decoded = atob(dataB64);
    const notification = JSON.parse(decoded) as DeveloperNotification;

    if (notification.testNotification) {
      // Sent when you click "Send test notification" in Play Console — just
      // confirms the pipe works.
      console.log("play-rtdn-webhook: received test notification");
      return new Response("OK (test)", { status: 200 });
    }

    const purchaseToken = notification.subscriptionNotification?.purchaseToken
      ?? notification.voidedPurchaseNotification?.purchaseToken;
    const notificationTypeLabel = notification.subscriptionNotification
      ? `subscriptionNotification:${notification.subscriptionNotification.notificationType}`
      : notification.voidedPurchaseNotification
      ? "voidedPurchaseNotification"
      : "unknown";

    if (!purchaseToken) {
      console.log("play-rtdn-webhook: notification carried no purchase token, nothing to do:", notificationTypeLabel);
      return new Response("OK (no token)", { status: 200 });
    }

    const packageName = notification.packageName || Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME") || "";
    if (!packageName) throw new Error("MISSING_PACKAGE_NAME");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // A voided purchase notification means Google (or the user, via
    // "Report a problem") refunded/revoked the purchase outright — pull
    // access immediately regardless of what subscriptionsv2 says, since a
    // voided purchase may already be gone from that endpoint.
    if (notification.voidedPurchaseNotification) {
      const { data: existing } = await supabaseAdmin
        .from("iap_purchases")
        .select("user_id")
        .eq("purchase_token", purchaseToken)
        .maybeSingle();
      if (existing?.user_id) {
        await supabaseAdmin.from("iap_purchases").update({
          status: "revoked",
          last_notification_type: "VOIDED_PURCHASE",
        }).eq("purchase_token", purchaseToken);
        await supabaseAdmin.from("profiles").update({ plan_status: "cancelled", plan_expires_at: null }).eq("id", existing.user_id);
      }
      return new Response("OK (voided)", { status: 200 });
    }

    // Look up which user this purchase token belongs to. If we don't have a
    // row yet, the notification likely arrived before (or instead of) the
    // app calling verify-play-receipt — re-check with Google and record what
    // we can, but there's no user to attach it to until the app links it, so
    // just fetch status for logging and stop.
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from("iap_purchases")
      .select("user_id, plan_code")
      .eq("purchase_token", purchaseToken)
      .maybeSingle();
    if (lookupErr) throw lookupErr;

    const status = await getSubscriptionStatus(packageName, purchaseToken);
    const { planStatus, expiresAtIso } = planStatusFor(status);

    if (!existing) {
      console.log(`play-rtdn-webhook: unrecognized purchase token (${notificationTypeLabel}), no user to update yet.`);
      return new Response("OK (unrecognized token)", { status: 200 });
    }

    await supabaseAdmin.from("iap_purchases").update({
      status: planStatus === "active" ? "active" : planStatus,
      expires_at: expiresAtIso,
      base_plan_id: status.basePlanId,
      last_notification_type: notificationTypeLabel,
      raw_response: status.raw,
    }).eq("purchase_token", purchaseToken);

    await supabaseAdmin.from("profiles").update({
      plan_status: planStatus,
      plan_expires_at: expiresAtIso,
    }).eq("id", existing.user_id);

    console.log(`play-rtdn-webhook: updated user ${existing.user_id} -> ${planStatus} (${notificationTypeLabel})`);
    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("play-rtdn-webhook error:", err?.message ?? err);
    // Return 500 so Pub/Sub retries — this is a transient/config error, not
    // a "notification we understand but choose to ignore" case.
    return new Response("Internal error", { status: 500 });
  }
});
