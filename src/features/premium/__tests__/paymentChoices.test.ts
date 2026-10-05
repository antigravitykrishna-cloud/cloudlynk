import { paymentChoices } from '@/features/premium/paymentChoices';

describe('paymentChoices', () => {
  it('lists Google Play between UPI and the card gateways when it is offered', () => {
    expect(paymentChoices(['sabpaisa', 'razorpay', 'upi'], { includePlay: true })).toEqual([
      'upi',
      'play',
      'razorpay',
      'sabpaisa',
    ]);
  });

  it('leaves Google Play out after Google has already shown its own choice screen', () => {
    expect(paymentChoices(['upi', 'razorpay'], { includePlay: false })).toEqual([
      'upi',
      'razorpay',
    ]);
  });

  it('shows only the gateways the server has keys for', () => {
    expect(paymentChoices(['sabpaisa'], { includePlay: true })).toEqual(['play', 'sabpaisa']);
  });
});
