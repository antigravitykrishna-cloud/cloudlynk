import { Chip } from '@/components/ui/Chip';
import { formatDate } from '@/utils/format';
import { isPlanActive } from '@/features/premium/planStatus';

/** An account's plan as one chip: LIFETIME, PREMIUM · until, EXPIRED or FREE. */
export function PlanChip({
  plan,
}: {
  plan: { plan_status: string | null; plan_expires_at: string | null };
}) {
  if (plan.plan_status === 'lifetime') return <Chip label="LIFETIME" tone="good" />;
  if (isPlanActive(plan)) {
    return <Chip label={`PREMIUM · ${formatDate(plan.plan_expires_at)}`} tone="good" />;
  }
  if (plan.plan_status === 'active' || plan.plan_status === 'expired') {
    return <Chip label="EXPIRED" tone="warn" />;
  }
  return <Chip label="FREE" />;
}
