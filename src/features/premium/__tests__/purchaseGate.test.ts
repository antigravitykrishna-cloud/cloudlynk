import { purchaseGate } from '@/features/premium/purchaseGate';

describe('purchaseGate', () => {
  const approved = { isGuest: false, approvalStatus: 'approved' as const, isApproved: true };

  it('lets an approved, saved account buy', () => {
    expect(purchaseGate(approved)).toBeNull();
  });

  it('asks a guest ID to save the account first, whatever its approval', () => {
    expect(purchaseGate({ ...approved, isGuest: true })).toBe('save');
  });

  it('holds a new account until an admin approves it', () => {
    expect(purchaseGate({ ...approved, approvalStatus: 'pending', isApproved: false })).toBe(
      'pending',
    );
  });

  it('refuses a rejected account', () => {
    expect(purchaseGate({ ...approved, approvalStatus: 'rejected', isApproved: false })).toBe(
      'rejected',
    );
  });
});
