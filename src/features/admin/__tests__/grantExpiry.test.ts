import { grantExpiry } from '@/features/admin/grantExpiry';

const NOW = Date.parse('2026-10-05T00:00:00Z');

describe('grantExpiry', () => {
  it('has no end date until revoked', () => {
    expect(grantExpiry('forever', '', NOW)).toBeNull();
  });

  it('counts fixed lengths from now', () => {
    expect(grantExpiry('7d', '', NOW)).toBe('2026-10-12T00:00:00.000Z');
    expect(grantExpiry('30d', '', NOW)).toBe('2026-11-04T00:00:00.000Z');
  });

  it('accepts a future custom date', () => {
    expect(grantExpiry('custom', ' 2026-12-31 ', NOW)).toBe('2026-12-31T00:00:00.000Z');
  });

  it('refuses a custom date that is unreadable or past', () => {
    expect(() => grantExpiry('custom', 'next week', NOW)).toThrow('YYYY-MM-DD');
    expect(() => grantExpiry('custom', '2026-01-01', NOW)).toThrow('in the past');
  });
});
