import { callEdgeFunction } from '@/lib/edgeFunctions';
import { metaDeviceSignals } from '@/lib/metaAds';
import { sleep } from '@/utils/async';

// Our side of Razorpay (including its UPI app list) and Sabpaisa: the `payments` edge function.
// The app never decides that a payment worked. It creates an order on the server, sends the person
// to the gateway, then asks the server, which confirms with the gateway and switches Premium on.

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

/** What Razorpay's checkout hands back on success; the server checks the signature. */
export interface RazorpayProof {
  razorpayPaymentId: string;
  razorpaySignature: string;
}

const KNOWN_METHODS: readonly GatewayMethod[] = ['upi', 'razorpay', 'sabpaisa'];
const METHODS_CACHE_MS = 60_000;
const POLL_INTERVAL_MS = 3_000;

let cachedMethods: { at: number; methods: GatewayMethod[] } | null = null;

async function callPayments<T>(route: string, body: object = {}): Promise<T> {
  const res = await callEdgeFunction<T>(`payments/${route}`, body, {
    unreachableMessage: 'Could not reach the payment service. Check your connection and try again.',
  });
  if (!res.ok || !res.data)
    throw new Error(res.data?.error ?? 'The payment service had a problem.');
  return res.data;
}

export const paymentGatewaysApi = {
  /** Gateways the server has keys for. The app shows no button for the rest. */
  async listMethods(): Promise<GatewayMethod[]> {
    if (cachedMethods && Date.now() - cachedMethods.at < METHODS_CACHE_MS) {
      return cachedMethods.methods;
    }
    try {
      const res = await callPayments<{ methods?: string[] }>('config');
      const methods = KNOWN_METHODS.filter(m => res.methods?.includes(m));
      cachedMethods = { at: Date.now(), methods };
      return methods;
    } catch {
      // No gateways is always a safe answer: Google Play still works.
      return [];
    }
  },

  /** `alternativeBillingToken` is set when the person chose us on Google's choice screen. */
  async createOrder(
    planCode: string,
    method: GatewayMethod,
    alternativeBillingToken?: string,
  ): Promise<GatewayOrder> {
    // Lets the server report the confirmed purchase to Meta against this phone (lib/metaAds.ts).
    // null when ad measurement is off or not configured.
    const meta = await metaDeviceSignals();
    return callPayments<GatewayOrder>('create-order', {
      planCode,
      method,
      externalTransactionToken: alternativeBillingToken,
      meta,
    });
  },

  verifyOrder(orderId: string, proof?: RazorpayProof): Promise<{ status: OrderStatus }> {
    return callPayments('verify', { orderId, ...proof });
  },

  /**
   * Asks the server until the gateway has a final answer or `timeoutMs` passes. UPI confirmations
   * can lag a few seconds and Sabpaisa reports to the server, so 'pending' at first is normal.
   */
  async waitForPayment(
    orderId: string,
    { proof, timeoutMs }: { proof?: RazorpayProof; timeoutMs: number },
  ): Promise<OrderStatus> {
    const stillPending = { status: 'pending' as OrderStatus };
    const deadline = Date.now() + timeoutMs;
    let res = await paymentGatewaysApi.verifyOrder(orderId, proof).catch(() => stillPending);
    while (res.status === 'pending' && Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      res = await paymentGatewaysApi.verifyOrder(orderId).catch(() => stillPending);
    }
    return res.status;
  },
};
