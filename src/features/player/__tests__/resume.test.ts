import { shouldOfferResume } from '@/features/player/resume';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const yesterday = new Date(NOW - 86_400_000).toISOString();

const progress = (positionSeconds: number, durationSeconds: number, lastWatchedAt = yesterday) => ({
  positionSeconds,
  durationSeconds,
  lastWatchedAt,
});

describe('shouldOfferResume', () => {
  it('offers to resume a long video watched past 30 seconds', () => {
    expect(shouldOfferResume(progress(600, 5400), NOW)).toBe(true);
  });

  it('does not bother for the first few seconds', () => {
    expect(shouldOfferResume(progress(20, 5400), NOW)).toBe(false);
  });

  it('scales the threshold down for short clips', () => {
    expect(shouldOfferResume(progress(10, 32), NOW)).toBe(true);
    expect(shouldOfferResume(progress(8, 32), NOW)).toBe(false);
  });

  it('skips videos that were nearly finished', () => {
    expect(shouldOfferResume(progress(5000, 5400), NOW)).toBe(false);
  });

  it('forgets after a week', () => {
    const eightDaysAgo = new Date(NOW - 8 * 86_400_000).toISOString();
    expect(shouldOfferResume(progress(600, 5400, eightDaysAgo), NOW)).toBe(false);
  });

  it('has nothing to offer without saved progress', () => {
    expect(shouldOfferResume(null, NOW)).toBe(false);
  });
});
