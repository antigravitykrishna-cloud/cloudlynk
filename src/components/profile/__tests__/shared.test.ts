import { channelStatusBadge, initials, storagePercent } from '@/components/profile/shared';

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('krishna patel')).toBe('KP');
    expect(initials('Ana Maria de Souza')).toBe('AM');
    expect(initials('Cher')).toBe('C');
  });

  it('falls back without a name', () => {
    expect(initials(null)).toBe('??');
    expect(initials('')).toBe('??');
  });
});

describe('storagePercent', () => {
  it('is the share used, capped at 100', () => {
    expect(storagePercent(5, 20)).toBe(25);
    expect(storagePercent(30, 20)).toBe(100);
  });
});

describe('channelStatusBadge', () => {
  it('labels active and pending, and treats anything else as suspended', () => {
    expect(channelStatusBadge('active').label).toBe('Active');
    expect(channelStatusBadge('pending').label).toBe('Pending');
    expect(channelStatusBadge('suspended').label).toBe('Suspended');
    expect(channelStatusBadge(null).label).toBe('Suspended');
  });
});
