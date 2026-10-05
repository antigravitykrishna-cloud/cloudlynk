import { shouldOfferPlans } from '@/features/auth/launchRouting';

describe('shouldOfferPlans', () => {
  const freeApproved = { isPaidUser: false, approvalStatus: 'approved' as const, isGuest: false };

  it('offers the plans to an approved account without a plan', () => {
    expect(shouldOfferPlans(freeApproved)).toBe(true);
  });

  it('does not offer them to paying or rejected accounts', () => {
    expect(shouldOfferPlans({ ...freeApproved, isPaidUser: true })).toBe(false);
    expect(shouldOfferPlans({ ...freeApproved, approvalStatus: 'rejected' })).toBe(false);
  });

  it('waits while an account is pending approval, except for guest IDs', () => {
    expect(shouldOfferPlans({ ...freeApproved, approvalStatus: 'pending' })).toBe(false);
    expect(shouldOfferPlans({ ...freeApproved, approvalStatus: 'pending', isGuest: true })).toBe(
      true,
    );
  });
});
