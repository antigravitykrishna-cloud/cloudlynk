import { useEffect, useRef, useState } from 'react';
import { showAlert } from '@/components/ui/Feedback';
import { fireHaptic } from '@/components/ui/Press';
import { config } from '@/lib/config';
import { logCheckoutStarted } from '@/lib/metaAds';
import { errorMessage } from '@/utils/errors';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  paymentGatewaysApi,
  type GatewayMethod,
  type OrderStatus,
  type RazorpayProof,
  type SabpaisaOrder,
} from '@/features/premium/api/paymentGatewaysApi';
import type { SubscriptionPlan } from '@/features/premium/api/plansApi';
import { getIapService } from '@/features/premium/billing/googlePlayBilling';
import { openRazorpay } from '@/features/premium/billing/razorpayCheckout';
import { paymentChoices, type PaymentChoice } from '@/features/premium/paymentChoices';

// How long to keep asking the server for a gateway's verdict. Long after a completed checkout;
// short when the person most likely backed out -- but still ask, because a UPI payment can go
// through even when the UPI app never reports back.
const CONFIRM_AFTER_CHECKOUT_MS = 45_000;
const CONFIRM_AFTER_CLOSE_MS = 8_000;

// 'abandoned' = the person closed the checkout and the gateway has not confirmed anything. It is
// NOT 'failed': a UPI payment can still complete after the checkout closes, and the server grants
// Premium when it does, so telling them "no money was taken" could be false.
type UnpaidOutcome = Exclude<OrderStatus, 'paid'> | 'abandoned';

const UNPAID_ALERTS: Record<UnpaidOutcome, [title: string, message: string]> = {
  failed: [
    'Payment failed',
    'The payment did not go through. You can try again or pick another way to pay.',
  ],
  abandoned: [
    'Payment not completed',
    'We have not received a payment. If money was deducted anyway, Premium switches on by itself within a few minutes -- you do not need to pay again.',
  ],
  pending: [
    'Waiting for confirmation',
    'Your bank has not confirmed the payment yet. If money was deducted, Premium switches on by itself within a few minutes -- you do not need to pay again.',
  ],
};

/** Our own payment sheet. `alternativeBillingToken` is set when Google's choice screen led here. */
export type PaymentSheetState = { choices: PaymentChoice[]; alternativeBillingToken?: string };

/**
 * Buying Premium. Ways to pay: Google Play, plus UPI / Razorpay / Sabpaisa when the server has their
 * keys. `config.alternativeBilling` decides how they are offered:
 *   'user_choice'  Google's choice screen first; picking us there opens our sheet
 *   'test'         our sheet straight away, with Google Play as one row (sideloaded test builds)
 *   'off'          Google Play only
 *
 * `onActivated` runs when the person dismisses the confirmation that Premium is on, after a
 * purchase or a restore.
 */
export function usePremiumCheckout(plan: SubscriptionPlan | undefined, onActivated: () => void) {
  const { user, refreshProfile } = useAuth();
  const [gatewayMethods, setGatewayMethods] = useState<GatewayMethod[]>([]);
  const [sheet, setSheet] = useState<PaymentSheetState | null>(null);
  const [sabpaisaOrder, setSabpaisaOrder] = useState<SabpaisaOrder | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // The Sabpaisa page can report the end of checkout more than once (callback load, then close);
  // the ref makes sure only the first report asks the server.
  const openSabpaisaOrderId = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || config.alternativeBilling === 'off') return;
    paymentGatewaysApi.listMethods().then(setGatewayMethods);
  }, [user?.id]);

  async function premiumActivated(title: string, message: string) {
    // A completed purchase is the most important confirmation in the app; it should be felt as
    // well as read.
    fireHaptic('success');
    await refreshProfile();
    showAlert(title, message, [{ text: 'OK', onPress: onActivated }]);
  }

  async function reportGatewayOutcome(outcome: OrderStatus | 'abandoned') {
    if (outcome === 'paid') {
      await premiumActivated('Success', "You're now on Premium!");
      return;
    }
    fireHaptic(outcome === 'failed' ? 'error' : 'warning');
    showAlert(...UNPAID_ALERTS[outcome]);
  }

  /** Asks the server for the order's verdict while the "Confirming" overlay shows. */
  async function confirmGatewayPayment(
    orderId: string,
    checkoutCompleted: boolean,
    proof?: RazorpayProof,
  ) {
    setConfirming(true);
    try {
      const status = await paymentGatewaysApi.waitForPayment(orderId, {
        proof,
        timeoutMs: checkoutCompleted ? CONFIRM_AFTER_CHECKOUT_MS : CONFIRM_AFTER_CLOSE_MS,
      });
      await reportGatewayOutcome(status === 'pending' && !checkoutCompleted ? 'abandoned' : status);
    } finally {
      setConfirming(false);
    }
  }

  async function buyOnGooglePlay(userChoiceBilling: boolean) {
    if (!plan) return;
    setPurchasing(true);
    try {
      const result = await getIapService().purchasePlan(plan.code, { userChoiceBilling });
      if (result.alternativeBillingToken) {
        // The person picked our own option on Google's choice screen.
        setSheet({
          choices: paymentChoices(gatewayMethods, { includePlay: false }),
          alternativeBillingToken: result.alternativeBillingToken,
        });
      } else if (result.success) {
        await premiumActivated('Success', "You're now on Premium!");
      } else {
        fireHaptic('error');
        showAlert('Purchase failed', result.errorMessage ?? 'Please try again.');
      }
    } catch (err) {
      showAlert('Purchase failed', errorMessage(err, 'Please try again.'));
    } finally {
      setPurchasing(false);
    }
  }

  /** "Proceed to Payment". */
  async function proceed() {
    if (!plan) return;
    logCheckoutStarted(plan.code, plan.price_inr);
    const hasGateways = gatewayMethods.length > 0;
    if (config.alternativeBilling === 'test' && hasGateways) {
      setSheet({ choices: paymentChoices(gatewayMethods, { includePlay: true }) });
      return;
    }
    await buyOnGooglePlay(config.alternativeBilling === 'user_choice' && hasGateways);
  }

  /** A row picked in our payment sheet. */
  async function payWith(choice: PaymentChoice) {
    if (!plan) return;
    if (choice === 'play') {
      setSheet(null);
      await buyOnGooglePlay(false);
      return;
    }
    setPurchasing(true);
    try {
      const order = await paymentGatewaysApi.createOrder(
        plan.code,
        choice,
        sheet?.alternativeBillingToken,
      );
      setSheet(null);
      if (order.provider === 'razorpay') {
        const proof = await openRazorpay(order);
        await confirmGatewayPayment(order.orderId, proof !== null, proof ?? undefined);
      } else {
        // Continues in finishSabpaisa once the checkout page closes.
        openSabpaisaOrderId.current = order.orderId;
        setSabpaisaOrder(order);
      }
    } catch (err) {
      showAlert('Payment failed', errorMessage(err, 'Please try again.'));
    } finally {
      setPurchasing(false);
    }
  }

  /** The Sabpaisa page is done: 'returned' after Sabpaisa posted its result, 'closed' if not. */
  async function finishSabpaisa(how: 'returned' | 'closed') {
    setSabpaisaOrder(null);
    const orderId = openSabpaisaOrderId.current;
    openSabpaisaOrderId.current = null;
    if (orderId) await confirmGatewayPayment(orderId, how === 'returned');
  }

  // Play expects a way to recover an existing subscription without paying again -- after a
  // reinstall, a factory reset or a new phone.
  async function restore() {
    setRestoring(true);
    try {
      const results = await getIapService().restorePurchases();
      if (results.some(result => result.success)) {
        await premiumActivated('Subscription restored', 'Your Premium access is active again.');
      } else {
        await refreshProfile();
        // Deliberately not phrased as a failure. The usual case is someone who never subscribed
        // on this Google account, and "something went wrong" invites a support message.
        showAlert(
          'Nothing to restore',
          'No previous purchase was found for this Google account. If you subscribed with a different account, sign in to that one on this device and try again.',
        );
      }
    } catch (err) {
      showAlert('Could not restore', errorMessage(err, 'Please try again.'));
    } finally {
      setRestoring(false);
    }
  }

  return {
    hasGateways: gatewayMethods.length > 0,
    sheet,
    closeSheet: () => setSheet(null),
    sabpaisaOrder,
    purchasing,
    confirming,
    restoring,
    proceed,
    payWith,
    finishSabpaisa,
    restore,
  };
}
