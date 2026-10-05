import type { GatewayMethod, OrderStatus } from './gateways';

/** A way to pay on the payment sheet: a direct gateway, or Google Play. */
export type PaymentChoice = GatewayMethod | 'play';

/**
 * Why a signed-in account cannot buy yet, or null if it can. Guest accounts save their account
 * first (the server also refuses their orders); pending accounts wait for approval; rejected
 * accounts cannot buy.
 */
export type PurchaseGate = 'save' | 'pending' | 'rejected' | null;

export function purchaseGate(account: {
  isGuest: boolean;
  isApproved: boolean;
  approvalStatus: string | null | undefined;
}): PurchaseGate {
  if (account.isGuest) return 'save';
  if (account.approvalStatus === 'rejected') return 'rejected';
  if (!account.isApproved) return 'pending';
  return null;
}

export const GATE_COPY: Record<
  Exclude<PurchaseGate, null>,
  { title: string; text: string; button: string }
> = {
  save: {
    title: 'Save your account to subscribe',
    text: 'You are using a guest ID. Save it with Google or email first, so your plan is never lost if you change phones or reinstall.',
    button: 'Save account to continue',
  },
  pending: {
    title: 'Your account is being reviewed',
    text: 'An admin approves new accounts before they can subscribe. You’ll be notified once that’s done — everything else in Cloudlynk keeps working in the meantime.',
    button: 'Awaiting admin approval',
  },
  rejected: {
    title: 'Premium is not available for this account',
    text: 'You can keep using Cloudlynk’s free features as normal. Contact support if you think this is a mistake.',
    button: 'Not available',
  },
};

/** "1 year", "6 months", "1 month", or "N days". */
export function durationLabel(days: number): string {
  if (days >= 365) return '1 year';
  if (days >= 180) return '6 months';
  if (days >= 30) return '1 month';
  return `${days} days`;
}

/** The payment sheet's options in test mode: Google Play plus whichever gateways are live. */
export function testSheetChoices(methods: GatewayMethod[]): PaymentChoice[] {
  const order: PaymentChoice[] = ['upi', 'play', 'razorpay', 'sabpaisa'];
  return order.filter(c => c === 'play' || methods.includes(c));
}

/** How long to wait for the server to confirm a gateway payment. */
export function confirmWindowMs(checkoutReported: boolean): number {
  // Without a checkout result the person most likely backed out, so do not keep them waiting
  // long -- but still ask, because a UPI payment can go through even when the UPI app never
  // reports back.
  return checkoutReported ? 45_000 : 8_000;
}

/**
 * What to tell the person after a gateway checkout. 'abandoned' = they closed the checkout and
 * the gateway has not confirmed anything. It is NOT 'failed': a UPI payment can still complete
 * after the checkout closes, and the server grants Premium when it does, so telling them "no money
 * was taken" could be false.
 */
export function gatewayOutcome(
  status: OrderStatus,
  checkoutReported: boolean,
): OrderStatus | 'abandoned' {
  return status === 'pending' && !checkoutReported ? 'abandoned' : status;
}
