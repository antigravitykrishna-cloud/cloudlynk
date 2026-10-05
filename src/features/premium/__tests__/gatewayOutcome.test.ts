import { confirmWindowMs, gatewayOutcome } from '@/features/premium/gatewayOutcome';

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
});

describe('confirmWindowMs', () => {
  it('waits longer when the checkout reported back', () => {
    expect(confirmWindowMs(true)).toBeGreaterThan(confirmWindowMs(false));
  });
});
