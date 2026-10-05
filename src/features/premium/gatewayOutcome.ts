import type { OrderStatus } from '@/features/premium/api/paymentGatewaysApi';

/**
 * How a gateway payment ended, as far as the app can tell. 'abandoned' means the checkout closed
 * without reporting back and the gateway has not confirmed anything. It is NOT 'failed': a UPI
 * payment can still complete after the checkout closes, and the server grants Premium when it
 * does, so telling the person "no money was taken" could be false.
 */
export type GatewayOutcome = OrderStatus | 'abandoned';

export function gatewayOutcome(status: OrderStatus, checkoutCompleted: boolean): GatewayOutcome {
  return status === 'pending' && !checkoutCompleted ? 'abandoned' : status;
}

/**
 * How long to keep asking the server for the verdict: long after a completed checkout, short when
 * the person most likely backed out -- but still asked, because a UPI payment can go through even
 * when the UPI app never reports back.
 */
export function confirmWindowMs(checkoutCompleted: boolean): number {
  return checkoutCompleted ? 45_000 : 8_000;
}
