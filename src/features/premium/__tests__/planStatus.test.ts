import { isPlanActive, isPlanAwaitingExpiry } from '@/features/premium/planStatus';

const NOW = new Date('2026-10-01T12:00:00Z');
const PAST = '2026-09-30T12:00:00Z';
const FUTURE = '2026-10-02T12:00:00Z';

describe('isPlanActive', () => {
  it('is false with no profile', () => {
    expect(isPlanActive(null, NOW)).toBe(false);
    expect(isPlanActive(undefined, NOW)).toBe(false);
  });

  it('is true for lifetime, whatever the end date', () => {
    expect(isPlanActive({ plan_status: 'lifetime' }, NOW)).toBe(true);
    expect(isPlanActive({ plan_status: 'lifetime', plan_expires_at: PAST }, NOW)).toBe(true);
  });

  it('is true for active with a future end date or none', () => {
    expect(isPlanActive({ plan_status: 'active', plan_expires_at: FUTURE }, NOW)).toBe(true);
    expect(isPlanActive({ plan_status: 'active', plan_expires_at: null }, NOW)).toBe(true);
  });

  it('is false for active once the end date has passed', () => {
    expect(isPlanActive({ plan_status: 'active', plan_expires_at: PAST }, NOW)).toBe(false);
  });

  it.each(['free', 'expired', 'cancelled'])('is false for %s', status => {
    expect(isPlanActive({ plan_status: status, plan_expires_at: FUTURE }, NOW)).toBe(false);
  });
});

describe('isPlanAwaitingExpiry', () => {
  it('flags an active plan whose end date has passed', () => {
    expect(isPlanAwaitingExpiry({ plan_status: 'active', plan_expires_at: PAST }, NOW)).toBe(true);
  });

  it('does not flag a running plan or a plan that is not active', () => {
    expect(isPlanAwaitingExpiry({ plan_status: 'active', plan_expires_at: FUTURE }, NOW)).toBe(
      false,
    );
    expect(isPlanAwaitingExpiry({ plan_status: 'expired', plan_expires_at: PAST }, NOW)).toBe(
      false,
    );
    expect(isPlanAwaitingExpiry(null, NOW)).toBe(false);
  });
});
