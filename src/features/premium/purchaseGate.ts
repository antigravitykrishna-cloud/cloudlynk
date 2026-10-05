import type { Access } from '@/features/auth/access';

/**
 * Why a signed-in account cannot buy Premium yet, if it cannot. Guest IDs save their account first
 * (the server refuses their orders too), new accounts wait for an admin's approval, rejected
 * accounts cannot buy at all.
 */
export type PurchaseGate = 'save' | 'pending' | 'rejected';

export function purchaseGate(
  access: Pick<Access, 'isGuest' | 'approvalStatus' | 'isApproved'>,
): PurchaseGate | null {
  if (access.isGuest) return 'save';
  if (access.approvalStatus === 'rejected') return 'rejected';
  if (!access.isApproved) return 'pending';
  return null;
}

export const PURCHASE_GATE_COPY: Record<
  PurchaseGate,
  { title: string; message: string; button: string }
> = {
  save: {
    title: 'Save your account to subscribe',
    message:
      'You are using a guest ID. Save it with Google or email first, so your plan is never lost if you change phones or reinstall.',
    button: 'Save account to continue',
  },
  pending: {
    title: 'Your account is being reviewed',
    message:
      'An admin approves new accounts before they can subscribe. You’ll be notified once that’s done — everything else in Cloudlynk keeps working in the meantime.',
    button: 'Awaiting admin approval',
  },
  rejected: {
    title: 'Premium is not available for this account',
    message:
      'You can keep using Cloudlynk’s free features as normal. Contact support if you think this is a mistake.',
    button: 'Not available',
  },
};
