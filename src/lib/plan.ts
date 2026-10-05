/** A subscription as stored on `profiles`. */
export type PlanStatus = 'free' | 'active' | 'expired' | 'cancelled' | 'lifetime';

export interface PlanFields {
  plan_status?: string | null;
  plan_expires_at?: string | null;
}

/**
 * Whether the plan gives access right now. Mirrors public.is_plan_active():
 * 'lifetime', or 'active' with no end date or an end date still in the future.
 *
 * plan_status alone is not enough: the hourly expiry job can leave a lapsed
 * plan marked 'active' for up to an hour.
 */
export function isPlanActive(plan: PlanFields | null | undefined, now: Date = new Date()): boolean {
  if (!plan) return false;
  if (plan.plan_status === 'lifetime') return true;
  if (plan.plan_status !== 'active') return false;
  return !plan.plan_expires_at || new Date(plan.plan_expires_at) > now;
}

/** Marked 'active' but past its end date: lapsed, waiting for the expiry job. */
export function isPlanAwaitingExpiry(
  plan: PlanFields | null | undefined,
  now: Date = new Date(),
): boolean {
  return plan?.plan_status === 'active' && !isPlanActive(plan, now);
}
