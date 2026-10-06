import { hasFullAccess, isActivated, ACTIVATION_MS, type AccessInput } from '../access';

const NOW = 1_800_000_000_000;
const base: AccessInput = {
  persona: 'organic',
  activationTime: NOW - ACTIVATION_MS - 1,
  needsAdminApproval: false,
  isRejected: false,
};

describe('hasFullAccess', () => {
  it('lets an approved, activated, subscribed organic user in', () => {
    expect(hasFullAccess(base, true, NOW)).toBe(true);
  });

  it('blocks a rejected user even if subscribed and activated', () => {
    expect(hasFullAccess({ ...base, isRejected: true }, true, NOW)).toBe(false);
  });

  it('blocks a rejected inorganic user too', () => {
    expect(hasFullAccess({ ...base, persona: 'inorganic', isRejected: true }, true, NOW)).toBe(
      false,
    );
  });

  it('blocks organic users still waiting for approval', () => {
    expect(hasFullAccess({ ...base, needsAdminApproval: true }, true, NOW)).toBe(false);
  });

  it('blocks organic users inside the 48 hour window', () => {
    expect(hasFullAccess({ ...base, activationTime: NOW - 1000 }, true, NOW)).toBe(false);
    expect(isActivated({ ...base, activationTime: NOW - 1000 }, NOW)).toBe(false);
  });

  it('gives inorganic users instant access once subscribed', () => {
    const p = { ...base, persona: 'inorganic' as const, activationTime: null };
    expect(hasFullAccess(p, true, NOW)).toBe(true);
    expect(hasFullAccess(p, false, NOW)).toBe(false);
  });

  it('never gives reviewers access', () => {
    expect(hasFullAccess({ ...base, persona: 'reviewer' }, true, NOW)).toBe(false);
  });

  it('denies when there is no persona yet', () => {
    expect(hasFullAccess(null, true, NOW)).toBe(false);
  });
});
