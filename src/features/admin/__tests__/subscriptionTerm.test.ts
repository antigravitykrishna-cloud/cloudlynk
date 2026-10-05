import { daysUntil, isLapsedButUnswept, termLabel } from '@/features/admin/subscriptionTerm';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const inDays = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

describe('daysUntil', () => {
  it('counts whole days either side of now', () => {
    expect(daysUntil(inDays(5), NOW)).toBe(5);
    expect(daysUntil(inDays(-3), NOW)).toBe(-3);
    expect(daysUntil(null, NOW)).toBeNull();
  });
});

describe('termLabel', () => {
  it('describes a running, ending and ended term', () => {
    expect(termLabel('active', inDays(5), NOW)).toMatch(/^Ends .* · in 5d$/);
    expect(termLabel('active', inDays(0), NOW)).toMatch(/^Ends today · /);
    expect(termLabel('expired', inDays(-3), NOW)).toMatch(/^Ended .* · 3d ago$/);
  });

  it('has a label for lifetime and for no plan', () => {
    expect(termLabel('lifetime', null, NOW)).toBe('No end date · lifetime');
    expect(termLabel('free', null, NOW)).toBe('—');
  });
});

describe('isLapsedButUnswept', () => {
  it('flags an active plan whose date has passed', () => {
    expect(isLapsedButUnswept('active', inDays(-1), NOW)).toBe(true);
  });

  it('ignores running plans, other statuses and plans without a date', () => {
    expect(isLapsedButUnswept('active', inDays(2), NOW)).toBe(false);
    expect(isLapsedButUnswept('expired', inDays(-1), NOW)).toBe(false);
    expect(isLapsedButUnswept('active', null, NOW)).toBe(false);
  });
});
