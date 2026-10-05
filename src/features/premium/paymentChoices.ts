import type { GatewayMethod } from '@/features/premium/api/paymentGatewaysApi';

/** A row in our own "Choose payment method" sheet. */
export type PaymentChoice = GatewayMethod | 'play';

const DISPLAY_ORDER: readonly PaymentChoice[] = ['upi', 'play', 'razorpay', 'sabpaisa'];

/**
 * The sheet's rows, in display order: each gateway the server has keys for, plus Google Play when
 * the sheet is the first thing shown (test builds). After Google's own choice screen, Play is not
 * offered again.
 */
export function paymentChoices(
  methods: readonly GatewayMethod[],
  { includePlay }: { includePlay: boolean },
): PaymentChoice[] {
  return DISPLAY_ORDER.filter(choice =>
    choice === 'play' ? includePlay : methods.includes(choice),
  );
}
