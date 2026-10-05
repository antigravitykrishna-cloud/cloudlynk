import type { ApprovalStatus } from '@/features/auth/access';

/**
 * Whether to open the plans once after launch or sign-in. Not for paying accounts, rejected
 * accounts (they cannot buy), or accounts waiting for approval -- except guest IDs, whose next
 * step (saving the account) starts from the plans.
 */
export function shouldOfferPlans({
  isPaidUser,
  approvalStatus,
  isGuest,
}: {
  isPaidUser: boolean;
  approvalStatus: ApprovalStatus;
  isGuest: boolean;
}): boolean {
  if (isPaidUser || approvalStatus === 'rejected') return false;
  const waitingForApproval = approvalStatus === 'pending' && !isGuest;
  return !waitingForApproval;
}
