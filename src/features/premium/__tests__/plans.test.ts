import { defaultPlanCode, durationLabel } from '@/features/premium/plans';

describe('durationLabel', () => {
  it.each([
    [3, '3 days'],
    [7, '7 days'],
    [30, '1 month'],
    [180, '6 months'],
    [365, '1 year'],
  ])('%i days reads as "%s"', (days, label) => {
    expect(durationLabel(days)).toBe(label);
  });
});

describe('defaultPlanCode', () => {
  const plans = [
    { code: 'trial', is_popular: false },
    { code: 'gold-1m', is_popular: true },
    { code: 'diamond-1y', is_popular: false },
  ];

  it('starts on the plan asked for', () => {
    expect(defaultPlanCode(plans, 'diamond-1y')).toBe('diamond-1y');
  });

  it('falls back to the popular plan when the request is missing or unknown', () => {
    expect(defaultPlanCode(plans)).toBe('gold-1m');
    expect(defaultPlanCode(plans, 'retired-plan')).toBe('gold-1m');
  });

  it('falls back to the first plan when none is popular', () => {
    expect(defaultPlanCode(plans.map(p => ({ ...p, is_popular: false })))).toBe('trial');
  });

  it('has nothing to pick from an empty list', () => {
    expect(defaultPlanCode([])).toBeNull();
  });
});
