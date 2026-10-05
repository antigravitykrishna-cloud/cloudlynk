import { Colors } from '@/theme';
import type { RazorpayOrder, RazorpayProof } from '@/features/premium/api/paymentGatewaysApi';

/**
 * Razorpay's native checkout. For a 'upi' order it lists only the UPI apps on the phone. Resolves
 * with the payment proof, or null if the checkout was closed or failed -- the caller asks the
 * server either way, since a UPI payment can succeed without the app hearing back.
 */
export async function openRazorpay(order: RazorpayOrder): Promise<RazorpayProof | null> {
  // Lazy: the native module only exists in a build that includes it, and a missing module must
  // not take the Premium screen down with it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, loaded on first use
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
        blocks: { upi: { name: 'Pay with any UPI app', instruments: [{ method: 'upi' }] } },
        sequence: ['block.upi'],
        preferences: { show_default_blocks: false },
      },
    };
  }

  try {
    const data = await RazorpayCheckout.open(options);
    if (!data?.razorpay_payment_id || !data?.razorpay_signature) return null;
    return {
      razorpayPaymentId: data.razorpay_payment_id,
      razorpaySignature: data.razorpay_signature,
    };
  } catch {
    return null;
  }
}
