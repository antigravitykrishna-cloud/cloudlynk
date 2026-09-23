// payments -- Razorpay (including its UPI app-list checkout) and Sabpaisa.
//
// Routes (the last path segment):
//   POST /payments/config             which gateways are switched on
//   POST /payments/create-order       signed in: start a payment for a plan
//   POST /payments/verify             signed in: confirm with the gateway, grant
//   POST /payments/razorpay-webhook   from Razorpay's servers (signed)
//   POST /payments/sabpaisa-callback  from Sabpaisa, via the payer's browser
//
// Deploy with --no-verify-jwt: the two gateway routes are called without a
// Supabase session. The user routes check the session themselves.
//
// The rule this whole file exists to keep: the app never tells the server
// "the payment worked". It asks the server to find out. Premium is granted
// only after the gateway's own server confirms the money arrived, via
// grant_gateway_payment (migration v80), which is idempotent -- the webhook,
// the callback and the app's verify call can all arrive, in any order, and a
// payment still extends the plan exactly once.
//
// A gateway is offered only when its secrets are set (see _shared/gateways.ts),
// so the buttons in the app appear by themselves once the client adds keys.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import {
  parseSabpaisa,
  razorpayCapture,
  razorpayCheckoutSignatureValid,
  razorpayConfigured,
  razorpayCreateOrder,
  razorpayGetPayment,
  razorpayKeyId,
  razorpayOrderPayments,
  razorpayWebhookSignatureValid,
  reportExternalTransaction,
  sabpaisaBuildRequest,
  sabpaisaConfigured,
  sabpaisaDecrypt,
  sabpaisaEnquire,
} from "../_shared/gateways.ts";
import { cleanMetaDevice, metaConfigured, sendMetaPurchase, type MetaDevice } from "../_shared/meta-capi.ts";

type Method = "upi" | "razorpay" | "sabpaisa";

interface Order {
  id: string;
  user_id: string | null;
  plan_code: string;
  amount_inr: number;
  duration_days: number;
  method: Method;
  provider: "razorpay" | "sabpaisa";
  status: "created" | "paid" | "failed";
  provider_order_id: string | null;
  external_transaction_token: string | null;
  google_reported_at: string | null;
  entitlement_expires_at: string | null;
  paid_at: string | null;
  meta_device: MetaDevice | null;
  meta_sent_at: string | null;
}

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await client.auth.getUser();
  return user ?? null;
}

/** Sabpaisa's clientTxnId: the order id without dashes (alphanumeric, 32). */
function txnIdFor(orderId: string): string {
  return orderId.replace(/-/g, "");
}

function orderIdFromTxnId(txnId: string): string | null {
  const t = txnId.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(t)) return null;
  return `${t.slice(0, 8)}-${t.slice(8, 12)}-${t.slice(12, 16)}-${t.slice(16, 20)}-${t.slice(20)}`;
}

function methodsAvailable(): Method[] {
  const out: Method[] = [];
  if (razorpayConfigured()) out.push("upi", "razorpay");
  if (sabpaisaConfigured()) out.push("sabpaisa");
  return out;
}

async function loadOrder(db: SupabaseClient, id: string): Promise<Order | null> {
  const { data } = await db.from("payment_orders").select("*").eq("id", id).maybeSingle();
  return (data as Order) ?? null;
}

/** Grants the plan (idempotently), then reports to Google if this sale came
 *  through user choice billing. A failed report never undoes the grant -- the
 *  person paid -- it is recorded and retried on the next verify. */
async function markPaid(db: SupabaseClient, order: Order, paymentId: string, raw: unknown) {
  const { data: expiresAt, error } = await db.rpc("grant_gateway_payment", {
    p_order_id: order.id,
    p_provider_payment_id: paymentId,
    p_raw: raw ?? null,
  });
  if (error) throw error;
  const fresh = (await loadOrder(db, order.id)) ?? order;
  await reportIfNeeded(db, fresh);
  await reportToMeta(db, fresh);
  return expiresAt as string | null;
}

/** Tells Meta about a confirmed purchase (the client's Meta ads). Skipped
 *  when the buyer turned ad measurement off (no meta_device on the order)
 *  or Meta is not configured. Never blocks or undoes the grant. */
async function reportToMeta(db: SupabaseClient, order: Order) {
  if (order.status !== "paid" || order.meta_sent_at || !order.meta_device || !metaConfigured()) return;
  try {
    const { data: prof } = order.user_id
      ? await db.from("profiles").select("email").eq("id", order.user_id).maybeSingle()
      : { data: null };
    await sendMetaPurchase({
      orderId: order.id,
      email: (prof as { email?: string } | null)?.email ?? null,
      amountInr: order.amount_inr,
      planCode: order.plan_code,
      paidAt: order.paid_at ?? new Date().toISOString(),
      device: order.meta_device,
    });
    await db.from("payment_orders").update({ meta_sent_at: new Date().toISOString(), meta_error: null }).eq("id", order.id);
  } catch (err) {
    console.error("payments: Meta report failed", order.id, err);
    await db.from("payment_orders")
      .update({ meta_error: String((err as Error)?.message ?? err).slice(0, 500) })
      .eq("id", order.id);
  }
}

async function reportIfNeeded(db: SupabaseClient, order: Order) {
  if (order.status !== "paid" || !order.external_transaction_token || order.google_reported_at) return;
  try {
    await reportExternalTransaction({
      externalTransactionId: txnIdFor(order.id),
      externalTransactionToken: order.external_transaction_token,
      amountInr: order.amount_inr,
      transactionTime: order.paid_at ?? new Date().toISOString(),
    });
    await db.from("payment_orders")
      .update({ google_reported_at: new Date().toISOString(), google_report_error: null })
      .eq("id", order.id);
  } catch (err) {
    console.error("payments: Google report failed", order.id, err);
    await db.from("payment_orders")
      .update({ google_report_error: String((err as Error)?.message ?? err).slice(0, 500) })
      .eq("id", order.id);
  }
}

async function markFailed(db: SupabaseClient, orderId: string, reason: string) {
  await db.from("payment_orders")
    .update({ status: "failed", failure_reason: reason.slice(0, 300) })
    .eq("id", orderId)
    .eq("status", "created");
}

// ── Razorpay confirmation ──────────────────────────────────────────────────

/** Confirms a Razorpay payment against Razorpay's API. Captures it if it was
 *  only authorized. Returns true once the money is captured for this order. */
async function confirmRazorpayPayment(order: Order, paymentId: string): Promise<{ ok: boolean; raw: unknown; failed?: string }> {
  let payment = await razorpayGetPayment(paymentId);
  if (payment.order_id !== order.provider_order_id) return { ok: false, raw: payment, failed: "Payment belongs to a different order" };
  if (payment.currency !== "INR" || payment.amount !== order.amount_inr * 100) {
    return { ok: false, raw: payment, failed: "Amount does not match the plan price" };
  }
  if (payment.status === "authorized") payment = await razorpayCapture(paymentId, payment.amount);
  if (payment.status === "captured") return { ok: true, raw: payment };
  if (payment.status === "failed") return { ok: false, raw: payment, failed: payment.error_description ?? "Payment failed" };
  return { ok: false, raw: payment };
}

// ── Routes ─────────────────────────────────────────────────────────────────

async function handleConfig() {
  return jsonResponse({ methods: methodsAvailable() });
}

async function handleCreateOrder(req: Request) {
  const user = await requireUser(req);
  if (!user) return jsonResponse({ error: "Please sign in." }, 401);

  const body = await req.json().catch(() => ({}));
  const planCode = String(body?.planCode ?? "");
  const method = String(body?.method ?? "") as Method;
  const externalTransactionToken = typeof body?.externalTransactionToken === "string" && body.externalTransactionToken
    ? body.externalTransactionToken as string
    : null;

  if (!methodsAvailable().includes(method)) {
    return jsonResponse({ error: "This payment method is not available right now." }, 400);
  }

  const db = admin();

  // Same gate as the Premium screen: an account must be active and approved
  // before it can buy. The server re-checks because the app can be modified.
  const { data: profile } = await db.from("profiles")
    .select("email, full_name, account_status, approval_status")
    .eq("id", user.id).maybeSingle();
  if (!profile) return jsonResponse({ error: "Account not found." }, 404);
  if (profile.account_status && profile.account_status !== "active") {
    return jsonResponse({ error: "This account cannot make purchases." }, 403);
  }
  if (profile.approval_status && profile.approval_status !== "approved") {
    return jsonResponse({ error: "Your account is waiting for approval." }, 403);
  }

  // The price comes from the database, never from the app.
  const { data: plan } = await db.from("subscription_plans")
    .select("code, name, price_inr, duration_days, is_active")
    .eq("code", planCode).maybeSingle();
  if (!plan || !plan.is_active) return jsonResponse({ error: "That plan is not available." }, 400);

  const provider = method === "sabpaisa" ? "sabpaisa" : "razorpay";
  const { data: inserted, error: insErr } = await db.from("payment_orders").insert({
    user_id: user.id,
    plan_code: plan.code,
    amount_inr: plan.price_inr,
    duration_days: plan.duration_days,
    method,
    provider,
    external_transaction_token: externalTransactionToken,
    meta_device: cleanMetaDevice(body?.meta),
  }).select("*").single();
  if (insErr || !inserted) {
    console.error("payments: insert failed", insErr);
    return jsonResponse({ error: "Could not start the payment. Please try again." }, 500);
  }
  const order = inserted as Order;

  try {
    if (provider === "razorpay") {
      const rp = await razorpayCreateOrder(order.id, order.amount_inr, {
        order_id: order.id, plan_code: plan.code, user_id: user.id,
      });
      await db.from("payment_orders").update({ provider_order_id: rp.id }).eq("id", order.id);
      return jsonResponse({
        orderId: order.id,
        provider,
        method,
        keyId: razorpayKeyId(),
        providerOrderId: rp.id,
        amountPaise: order.amount_inr * 100,
        planName: plan.name,
        email: profile.email ?? user.email ?? "",
      });
    }

    const txnId = txnIdFor(order.id);
    await db.from("payment_orders").update({ provider_order_id: txnId }).eq("id", order.id);
    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payments/sabpaisa-callback`;
    const request = await sabpaisaBuildRequest({
      clientTxnId: txnId,
      amountInr: order.amount_inr,
      payerName: profile.full_name || "Cloudlynk user",
      payerEmail: profile.email || user.email || "noreply@thecloudlynk.com",
      // Sabpaisa requires a mobile number and Cloudlynk does not collect one.
      // The payer enters their own on Sabpaisa's page where it matters (UPI,
      // cards); this field is only the form's pre-fill.
      payerMobile: Deno.env.get("SABPAISA_DEFAULT_MOBILE") ?? "9999999999",
      callbackUrl,
    });
    return jsonResponse({ orderId: order.id, provider, method, ...request, callbackUrl });
  } catch (err) {
    console.error("payments: gateway order failed", err);
    await markFailed(db, order.id, String((err as Error)?.message ?? err));
    return jsonResponse({ error: "The payment gateway did not respond. Please try again." }, 502);
  }
}

async function handleVerify(req: Request) {
  const user = await requireUser(req);
  if (!user) return jsonResponse({ error: "Please sign in." }, 401);

  const body = await req.json().catch(() => ({}));
  const orderId = String(body?.orderId ?? "");
  const db = admin();
  const order = await loadOrder(db, orderId);
  if (!order || order.user_id !== user.id) return jsonResponse({ error: "Payment not found." }, 404);

  if (order.status === "paid") {
    await reportIfNeeded(db, order);
    await reportToMeta(db, order);
    return jsonResponse({ status: "paid", expiresAt: order.entitlement_expires_at });
  }
  if (order.status === "failed") return jsonResponse({ status: "failed" });

  try {
    if (order.provider === "razorpay") {
      const paymentId = typeof body?.razorpayPaymentId === "string" ? body.razorpayPaymentId : "";
      const signature = typeof body?.razorpaySignature === "string" ? body.razorpaySignature : "";

      if (paymentId && signature) {
        if (!order.provider_order_id || !(await razorpayCheckoutSignatureValid(order.provider_order_id, paymentId, signature))) {
          return jsonResponse({ error: "Payment could not be verified." }, 400);
        }
        const r = await confirmRazorpayPayment(order, paymentId);
        if (r.ok) return jsonResponse({ status: "paid", expiresAt: await markPaid(db, order, paymentId, r.raw) });
        if (r.failed) { await markFailed(db, order.id, r.failed); return jsonResponse({ status: "failed" }); }
        return jsonResponse({ status: "pending" });
      }

      // No checkout result (the app was closed mid-payment, or the UPI app
      // never handed control back). Ask Razorpay what happened to the order.
      if (order.provider_order_id) {
        for (const p of await razorpayOrderPayments(order.provider_order_id)) {
          if (p.status === "captured" || p.status === "authorized") {
            const r = await confirmRazorpayPayment(order, p.id);
            if (r.ok) return jsonResponse({ status: "paid", expiresAt: await markPaid(db, order, p.id, r.raw) });
          }
        }
      }
      return jsonResponse({ status: "pending" });
    }

    // Sabpaisa: its enquiry API is the source of truth.
    const res = await sabpaisaEnquire(txnIdFor(order.id));
    const code = res.statusCode ?? "";
    if (code === "0000") {
      const paid = Number(res.paidAmount ?? res.amount ?? "0");
      if (!(paid >= order.amount_inr)) {
        await markFailed(db, order.id, `Paid amount ${res.paidAmount} is below the plan price`);
        return jsonResponse({ status: "failed" });
      }
      return jsonResponse({ status: "paid", expiresAt: await markPaid(db, order, res.sabpaisaTxnId ?? "", res) });
    }
    if (code === "0300" || code === "0200" || code === "404") {
      await markFailed(db, order.id, res.sabpaisaMessage || `Sabpaisa status ${code}`);
      return jsonResponse({ status: "failed" });
    }
    return jsonResponse({ status: "pending" });
  } catch (err) {
    console.error("payments: verify failed", orderId, err);
    return jsonResponse({ status: "pending" });
  }
}

async function handleRazorpayWebhook(req: Request) {
  const raw = await req.text();
  if (!(await razorpayWebhookSignatureValid(raw, req.headers.get("X-Razorpay-Signature")))) {
    return jsonResponse({ error: "bad signature" }, 401);
  }
  const event = JSON.parse(raw);
  const payment = event?.payload?.payment?.entity;
  if (!payment?.order_id || !["payment.captured", "order.paid", "payment.failed"].includes(event?.event)) {
    return jsonResponse({ ok: true });
  }

  const db = admin();
  const { data } = await db.from("payment_orders").select("*").eq("provider_order_id", payment.order_id).maybeSingle();
  const order = data as Order | null;
  if (!order || order.status === "paid") return jsonResponse({ ok: true });

  if (event.event === "payment.failed") {
    // One failed attempt does not fail the order: the person can retry in the
    // same checkout. Leave it 'created'; verify and later events decide.
    return jsonResponse({ ok: true });
  }
  try {
    const r = await confirmRazorpayPayment(order, payment.id);
    if (r.ok) await markPaid(db, order, payment.id, r.raw);
  } catch (err) {
    console.error("payments: webhook grant failed", order.id, err);
    // Non-2xx makes Razorpay retry, which is what we want here.
    return jsonResponse({ error: "retry" }, 500);
  }
  return jsonResponse({ ok: true });
}

async function handleSabpaisaCallback(req: Request) {
  // Sabpaisa posts a form: encResponse=<hex>.
  const form = await req.formData().catch(() => null);
  const encResponse = form?.get("encResponse");
  const done = (msg: string) => new Response(msg, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (typeof encResponse !== "string" || !encResponse) return done("Returning to Cloudlynk…");

  try {
    const res = parseSabpaisa(await sabpaisaDecrypt(encResponse));
    const orderId = orderIdFromTxnId(res.clientTxnId ?? "");
    if (!orderId) return done("Returning to Cloudlynk…");
    const db = admin();
    const order = await loadOrder(db, orderId);
    if (!order || order.status !== "created") return done("Returning to Cloudlynk…");

    // The callback is authenticated (HMAC) but it travels through the payer's
    // browser, so confirm with Sabpaisa's server before granting anything.
    if (res.statusCode === "0000") {
      const check = await sabpaisaEnquire(txnIdFor(order.id));
      const paid = Number(check.paidAmount ?? check.amount ?? "0");
      if (check.statusCode === "0000" && paid >= order.amount_inr) {
        await markPaid(db, order, check.sabpaisaTxnId ?? "", check);
        return done("Payment received. Returning to Cloudlynk…");
      }
    } else if (res.statusCode === "0300" || res.statusCode === "0200") {
      await markFailed(db, order.id, res.sabpaisaMessage || `Sabpaisa status ${res.statusCode}`);
    }
  } catch (err) {
    console.error("payments: sabpaisa callback failed", err);
  }
  return done("Returning to Cloudlynk…");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  try {
    switch (route) {
      case "config": return await handleConfig();
      case "create-order": return await handleCreateOrder(req);
      case "verify": return await handleVerify(req);
      case "razorpay-webhook": return await handleRazorpayWebhook(req);
      case "sabpaisa-callback": return await handleSabpaisaCallback(req);
      default: return jsonResponse({ error: "Not found" }, 404);
    }
  } catch (err) {
    console.error("payments: unhandled", route, err);
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
