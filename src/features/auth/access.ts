import { isPlanActive } from '@/features/premium/planStatus';
import type { Profile } from '@/features/auth/api/profileApi';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/** What the signed-in person may do, derived from their account. Presentation only. */
export type Access = {
  isGuest: boolean;
  isAdmin: boolean;
  /** Who may buy Premium. The server enforces approval; this only decides what to show. */
  approvalStatus: ApprovalStatus;
  isApproved: boolean;
  planStatus: string;
  hasActivePlan: boolean;
  /** An active plan, or an admin (admins can watch everything without one). */
  isPaidUser: boolean;
};

export function describeAccess(
  profile: Profile | null,
  user: { is_anonymous?: boolean } | null,
): Access {
  // Defaults to approved while the profile loads, so "under review" never flashes.
  const approvalStatus = (profile?.approval_status as ApprovalStatus | undefined) ?? 'approved';
  const hasActivePlan = isPlanActive(profile);
  const isAdmin = !!profile?.is_admin;

  return {
    isGuest: !!user?.is_anonymous,
    isAdmin,
    approvalStatus,
    isApproved: approvalStatus === 'approved',
    planStatus: profile?.plan_status ?? 'free',
    hasActivePlan,
    isPaidUser: hasActivePlan || isAdmin,
  };
}
