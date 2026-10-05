import {
  confirmWindowMs,
  durationLabel,
  gatewayOutcome,
  purchaseGate,
  testSheetChoices,
} from '@/lib/payments/checkout';

describe('purchaseGate', () => {
  const approved = { isGuest: false, isApproved: true, approvalStatus: 'approved' };

  it('lets an approved account buy', () => {
    expect(purchaseGate(approved)).toBeNull();
  });

  it('asks a guest account to save itself first, whatever its approval', () => {
    expect(purchaseGate({ ...approved, isGuest: true })).toBe('save');
  });

  it('blocks rejected and pending accounts', () => {
    expect(purchaseGate({ ...approved, isApproved: false, approvalStatus: 'rejected' })).toBe(
      'rejected',
    );
    expect(purchaseGate({ ...approved, isApproved: false, approvalStatus: 'pending' })).toBe(
      'pending',
    );
  });
});

describe('durationLabel', () => {
  it.each([
    [3, '3 days'],
    [7, '7 days'],
    [30, '1 month'],
    [180, '6 months'],
    [365, '1 year'],
  ])('%p days -> %p', (days, label) => {
    expect(durationLabel(days)).toBe(label);
  });
});

describe('testSheetChoices', () => {
  it('always offers Google Play, in a fixed order', () => {
    expect(testSheetChoices([])).toEqual(['play']);
    expect(testSheetChoices(['sabpaisa', 'upi'])).toEqual(['upi', 'play', 'sabpaisa']);
  });
});

describe('gatewayOutcome', () => {
  it('treats an unconfirmed payment after a closed checkout as abandoned, not failed', () => {
    expect(gatewayOutcome('pending', false)).toBe('abandoned');
  });

  it('keeps pending when the checkout reported back', () => {
    expect(gatewayOutcome('pending', true)).toBe('pending');
  });

  it('passes paid and failed through', () => {
    expect(gatewayOutcome('paid', false)).toBe('paid');
    expect(gatewayOutcome('failed', true)).toBe('failed');
  });

  it('waits longer when the checkout reported back', () => {
    expect(confirmWindowMs(true)).toBeGreaterThan(confirmWindowMs(false));
  });
});
