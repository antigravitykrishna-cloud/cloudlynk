import { watchDecision, type Viewer } from '@/features/content/watchAccess';

const member: Viewer = { signedIn: true, isGuest: false, isPaidUser: false, isAdmin: false };
const free = { access_level: 'free' as const };
const premium = { access_level: 'premium' as const };

describe('watchDecision', () => {
  it('lets any signed-in account play a free title', () => {
    expect(watchDecision(free, member)).toBe('play');
  });

  it('sends a member without a plan to the plans for a premium title', () => {
    expect(watchDecision(premium, member)).toBe('plans');
  });

  it('lets subscribers, admins and the channel owner play premium titles', () => {
    expect(watchDecision(premium, { ...member, isPaidUser: true })).toBe('play');
    expect(watchDecision(premium, { ...member, isAdmin: true })).toBe('play');
    expect(watchDecision(premium, { ...member, isOwner: true })).toBe('play');
  });

  it('shows guests and signed-out visitors previews only, even of free titles', () => {
    expect(watchDecision(free, { ...member, signedIn: false })).toBe('guest');
    expect(watchDecision(free, { ...member, isGuest: true })).toBe('guest');
    expect(watchDecision(premium, { ...member, isGuest: true, isPaidUser: true })).toBe('guest');
  });
});
