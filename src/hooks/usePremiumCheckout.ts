import { useEffect, useRef, useState } from 'react';
import { showAlert } from '@/components/ui/Feedback';
import { fireHaptic } from '@/components/ui/Press';
import { config } from '@/lib/config';
import { logCheckoutStarted } from '@/lib/analytics/metaAds';
import type { SubscriptionPlan } from '@/lib/data/plans';
import { getIapService } from '@/lib/services/iap';
import { errorMessage } from '@/lib/errors';
import {
  createGatewayOrder,
  getGatewayMethods,
  openRazorpay,
  waitForPayment,
  type GatewayMethod,
  type OrderStatus,
  type SabpaisaOrder,
} from '@/lib/payments/gateways';
import {
  confirmWindowMs,
  gatewayOutcome,
  testSheetChoices,
  type PaymentChoice,
} from '@/lib/payments/checkout';

/**
 * Buying and restoring Premium. Ways to pay: Google Play, plus UPI / Razorpay / Sabpaisa when the
 * server has their keys. config.alternativeBilling decides how they are offered: 'user_choice' =
 * Google's choice screen first; 'test' = our sheet with Google Play as one option (sideloaded test
 * builds); 'off' = Google Play only.
 */
export function usePremiumCheckout({
  userId,
  plan,
  onPaid,
  onRestored,
  refreshProfile,
}: {
  userId: string | undefined;
  plan: SubscriptionPlan | undefined;
  onPaid: () => Promise<void>;
  onRestored: () => void;
  refreshProfile: () => Promise<unknown>;
}) {
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [gatewayMethods, setGatewayMethods] = useState<GatewayMethod[]>([]);
  const [sheet, setSheet] = useState<{ choices: PaymentChoice[]; token?: string } | null>(null);
  const [sabpaisaOrder, setSabpaisaOrder] = useState<SabpaisaOrder | null>(null);
  const [confirming, setConfirming] = useState(false);
  const sabpaisaOrderId = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || config.alternativeBilling === 'off') return;
    getGatewayMethods().then(setGatewayMethods);
  }, [userId]);

  const reportGatewayResult = async (status: OrderStatus | 'abandoned') => {
    if (status === 'paid') return onPaid();
    fireHaptic(status === 'failed' ? 'error' : 'warning');
    if (status === 'failed') {
      showAlert(
        'Payment failed',
        'The payment did not go through. You can try again or pick another way to pay.',
      );
    } else if (status === 'abandoned') {
      showAlert(
        'Payment not completed',
        'We have not received a payment. If money was deducted anyway, Premium switches on by itself within a few minutes -- you do not need to pay again.',
      );
    } else {
      showAlert(
        'Waiting for confirmation',
        'Your bank has not confirmed the payment yet. If money was deducted, Premium switches on by itself within a few minutes -- you do not need to pay again.',
      );
    }
  };

  const playPurchase = async (userChoiceBilling: boolean) => {
    if (!plan) return;
    setPurchasing(true);
    try {
      const result = await getIapService().purchasePlan(plan.code, { userChoiceBilling });
      if (result.alternativeBillingToken) {
        // Picked our option on Google's choice screen.
        setSheet({ choices: gatewayMethods, token: result.alternativeBillingToken });
      } else if (result.success) {
        await onPaid();
      } else {
        fireHaptic('error');
        showAlert('Purchase failed', result.errorMessage ?? 'Please try again.');
      }
    } catch (err: unknown) {
      showAlert('Purchase failed', errorMessage(err, 'Please try again.'));
    } finally {
      setPurchasing(false);
    }
  };

  const proceed = async () => {
    if (!plan) return;
    logCheckoutStarted(plan.code, plan.price_inr);
    if (config.alternativeBilling === 'test' && gatewayMethods.length > 0) {
      setSheet({ choices: testSheetChoices(gatewayMethods) });
      return;
    }
    await playPurchase(config.alternativeBilling === 'user_choice' && gatewayMethods.length > 0);
  };

  const payWith = async (choice: PaymentChoice) => {
    if (!plan) return;
    if (choice === 'play') {
      setSheet(null);
      await playPurchase(false);
      return;
    }
    setPurchasing(true);
    try {
      const order = await createGatewayOrder(plan.code, choice, sheet?.token);
      setSheet(null);
      if (order.provider === 'razorpay') {
        const result = await openRazorpay(order);
        setConfirming(true);
        const status = await waitForPayment(
          order.orderId,
          result ?? undefined,
          confirmWindowMs(!!result),
        );
        await reportGatewayResult(gatewayOutcome(status, !!result));
      } else {
        sabpaisaOrderId.current = order.orderId;
        setSabpaisaOrder(order);
      }
    } catch (err: unknown) {
      showAlert('Payment failed', errorMessage(err, 'Please try again.'));
    } finally {
      setConfirming(false);
      setPurchasing(false);
    }
  };

  const onSabpaisaDone = async (how: 'returned' | 'closed') => {
    setSabpaisaOrder(null);
    const id = sabpaisaOrderId.current;
    sabpaisaOrderId.current = null;
    if (!id) return;
    setConfirming(true);
    try {
      const returned = how === 'returned';
      const status = await waitForPayment(id, undefined, confirmWindowMs(returned));
      await reportGatewayResult(gatewayOutcome(status, returned));
    } finally {
      setConfirming(false);
    }
  };

  // Play expects a way to recover an existing entitlement without paying again (reinstall,
  // factory reset, new phone).
  const restore = async () => {
    setRestoring(true);
    try {
      const results = await getIapService().restorePurchases();
      const restored = results.some(r => r.success);
      await refreshProfile();
      if (restored) {
        showAlert('Subscription restored', 'Your Premium access is active again.', [
          { text: 'OK', onPress: onRestored },
        ]);
      } else {
        // Deliberately not phrased as a failure. The common case is someone
        // who never subscribed on this Google account, and telling them
        // something went wrong invites a support message about a bug.
        showAlert(
          'Nothing to restore',
          'No previous purchase was found for this Google account. If you subscribed with a different account, sign in to that one on this device and try again.',
        );
      }
    } catch (err: unknown) {
      showAlert('Could not restore', errorMessage(err, 'Please try again.'));
    } finally {
      setRestoring(false);
    }
  };

  return {
    purchasing,
    restoring,
    confirming,
    gatewayMethods,
    sheet,
    closeSheet: () => setSheet(null),
    sabpaisaOrder,
    proceed,
    payWith,
    onSabpaisaDone,
    restore,
  };
}
