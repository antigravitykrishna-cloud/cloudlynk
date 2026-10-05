import { joinGate, rowAction, searchChannels } from '@/features/channels/channelAccess';

describe('searchChannels', () => {
  const channels = [
    { name: 'Cricket Live', description: null },
    { name: 'Movies', description: 'Classic BOLLYWOOD films' },
  ];

  it('returns everything for an empty query', () => {
    expect(searchChannels(channels, '  ')).toBe(channels);
  });

  it('matches name or description, ignoring case', () => {
    expect(searchChannels(channels, 'cricket')).toEqual([channels[0]]);
    expect(searchChannels(channels, 'bollywood')).toEqual([channels[1]]);
    expect(searchChannels(channels, 'tennis')).toEqual([]);
  });
});

describe('joinGate', () => {
  const member = {
    signedIn: true,
    isGuest: false,
    isPaidUser: false,
    isAdmin: false,
    channelIsPublic: true,
  };

  it('lets a signed-in account join a public channel without a plan', () => {
    expect(joinGate(member)).toBeNull();
  });

  it('asks the signed-out to sign in and guest accounts to save first', () => {
    expect(joinGate({ ...member, signedIn: false })).toBe('sign_in');
    expect(joinGate({ ...member, isGuest: true })).toBe('save_account');
  });

  it('needs a plan (or admin) for a hidden channel', () => {
    expect(joinGate({ ...member, channelIsPublic: false })).toBe('premium');
    expect(joinGate({ ...member, channelIsPublic: false, isPaidUser: true })).toBeNull();
    expect(joinGate({ ...member, channelIsPublic: false, isAdmin: true })).toBeNull();
  });
});

describe('rowAction', () => {
  it('lets owners and admins manage, members leave, others join', () => {
    const channel = { owner_id: 'owner' };
    expect(rowAction(channel, { userId: 'owner', isAdmin: false, isMember: true })).toBe('manage');
    expect(rowAction(channel, { userId: 'x', isAdmin: true, isMember: false })).toBe('manage');
    expect(rowAction(channel, { userId: 'x', isAdmin: false, isMember: true })).toBe('leave');
    expect(rowAction(channel, { userId: undefined, isAdmin: false, isMember: false })).toBe('join');
  });
});
