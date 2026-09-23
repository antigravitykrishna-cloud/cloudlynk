import { supabase } from './supabase';
import { Colors } from '../constants/theme';
import { metaDeviceSignals } from './metaAds';

// Razorpay (incl. its UPI app-list checkout) and Sabpaisa, from the app side.
//
// The app never decides that a payment worked. It starts an order on the
// server (supabase/functions/payments), hands the person to the gateway, and
// then asks the server to confirm with the gateway's own servers. Premium is
// switched on by the server, so a faked "success" from a modified app or a
// UPI app gets nothing.

export type GatewayMethod = 'upi' | 'razorpay' | 'sabpaisa';

export interface RazorpayOrder {
  orderId: string;
  provider: 'razorpay';
  method: 'upi' | 'razorpay';
  keyId: string;
  providerOrderId: string;
  amountPaise: number;
  planName: string;
  email: string;
}

export interface SabpaisaOrder {
  orderId: string;
  provider: 'sabpaisa';
  method: 'sabpaisa';
  url: string;
  encData: string;
  clientCode: string;
  callbackUrl: string;
}

export type GatewayOrder = RazorpayOrder | SabpaisaOrder;

export type OrderStatus = 'paid' | 'pending' | 'failed';

async function call<T>(route: string, body: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`payments/${route}`, { body });
  if (error) {
    // functions.invoke wraps non-2xx responses; the server's message is in the body.
    let message = 'Could not reach the payment service. Check your connection and try again.';
    try {
      const ctx = (error as any)?.context;
      const json = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
      if (json?.error) message = json.error;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  return data as T;
}

let cachedMethods: { at: number; methods: GatewayMethod[] } | null = null;

/** Gateways the server has keys for. Buttons for the rest are not shown. */
export async function getGatewayMethods(): Promise<GatewayMethod[]> {
  if (cachedMethods && Date.now() - cachedMethods.at < 60_000) return cachedMethods.methods;
  try {
    const res = await call<{ methods: GatewayMethod[] }>('config');
    const methods = (res?.methods ?? []).filter(m => m === 'upi' || m === 'razorpay' || m === 'sabpaisa');
    cachedMethods = { at: Date.now(), methods };
    return methods;
  } catch {
    // No gateways is always a safe answer: Google Play still works.
    return [];
  }
}

export async function createGatewayOrder(
  planCode: string, method: GatewayMethod, externalTransactionToken?: string,
): Promise<GatewayOrder> {
  // Lets the server report the confirmed purchase to Meta against this phone
  // (lib/metaAds.ts). null when ad measurement is off or not configured.
  const meta = await metaDeviceSignals();
  return call<GatewayOrder>('create-order', { planCode, method, externalTransactionToken, meta });
}

export async function verifyGatewayOrder(
  orderId: string,
  razorpay?: { razorpayPaymentId: string; razorpaySignature: string },
): Promise<{ status: OrderStatus; expiresAt?: string | null }> {
  return call('verify', { orderId, ...(razorpay ?? {}) });
}

/**
 * Asks the server until the gateway has a final answer. UPI confirmations
 * can trail the person returning to the app by several seconds, and a
 * Sabpaisa callback lands on the server, not in the app -- so "pending" right
 * after returning is normal and is polled, not reported as a failure.
 */
export async function waitForPayment(
  orderId: string,
  first?: { razorpayPaymentId: string; razorpaySignature: string },
  timeoutMs = 45_000,
): Promise<OrderStatus> {
  const deadline = Date.now() + timeoutMs;
  let res = await verifyGatewayOrder(orderId, first).catch(() => ({ status: 'pending' as OrderStatus }));
  while (res.status === 'pending' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    res = await verifyGatewayOrder(orderId).catch(() => ({ status: 'pending' as OrderStatus }));
  }
  return res.status;
}

/**
 * Opens Razorpay's native checkout. For 'upi' it shows only UPI, where
 * Razorpay lists the UPI apps installed on the phone (GPay, PhonePe, Paytm,
 * ...) and opens the one the person picks. Resolves with the checkout's
 * result, or null if the person closed it or it errored -- in both cases the
 * caller still asks the server, because a UPI payment can succeed even when
 * the app never hears back from the UPI app.
 */
export async function openRazorpay(
  order: RazorpayOrder,
): Promise<{ razorpayPaymentId: string; razorpaySignature: string } | null> {
  // Lazy: the native module only exists in a build that includes it, and a
  // missing module must not take the Premium screen down with it.
  const RazorpayCheckout = require('react-native-razorpay').default;

  const options: Record<string, unknown> = {
    key: order.keyId,
    order_id: order.providerOrderId,
    amount: order.amountPaise,
    currency: 'INR',
    name: 'Cloudlynk',
    description: `${order.planName} plan`,
    prefill: { email: order.email },
    theme: { color: Colors.brandBlue },
  };
  if (order.method === 'upi') {
    options.config = {
      display: {
        blocks: {
          upi: { name: 'Pay with any UPI app', instruments: [{ method: 'upi' }] },
        },
        sequence: ['block.upi'],
        preferences: { show_default_blocks: false },
      },
    };
  }

  try {
    const data = await RazorpayCheckout.open(options);
    if (data?.razorpay_payment_id && data?.razorpay_signature) {
      return { razorpayPaymentId: data.razorpay_payment_id, razorpaySignature: data.razorpay_signature };
    }
    return null;
  } catch {
    return null;
  }
}

/** A Sabpaisa checkout page: an auto-submitting form, per Sabpaisa's docs. */
export function sabpaisaFormHtml(order: SabpaisaOrder): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0B1220;color:#9FB0C9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>Opening Sabpaisa…</p>
<form id="f" method="post" action="${esc(order.url)}">
<input type="hidden" name="encData" value="${esc(order.encData)}">
<input type="hidden" name="clientCode" value="${esc(order.clientCode)}">
</form>
<script>document.getElementById('f').submit();</script>
</body></html>`;
}
