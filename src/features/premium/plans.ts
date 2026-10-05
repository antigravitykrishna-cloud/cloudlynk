import type { SubscriptionPlan } from '@/features/premium/api/plansApi';

/** A plan's length in words, rounded to the nearest unit people buy in. */
export function durationLabel(days: number): string {
  if (days >= 365) return '1 year';
  if (days >= 180) return '6 months';
  if (days >= 30) return '1 month';
  return `${days} days`;
}

/**
 * The plan a picker starts on: the one asked for (e.g. /premium?plan=gold-1m), else the one marked
 * popular -- the plan the business wants to sell -- else the first.
 */
export function defaultPlanCode(
  plans: Pick<SubscriptionPlan, 'code' | 'is_popular'>[],
  requested?: string,
): string | null {
  const plan = plans.find(p => p.code === requested) ?? plans.find(p => p.is_popular) ?? plans[0];
  return plan?.code ?? null;
}
