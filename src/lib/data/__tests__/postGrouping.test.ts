import {
  dedupeById,
  exploreOrderColumn,
  groupByGenre,
  mergeFeed,
  seriesLabel,
} from '@/lib/data/posts/grouping';
import type { ChannelPost, GuestChannelPost } from '@/lib/data/posts';

const row = (id: string, created_at: string) => ({ id, created_at }) as GuestChannelPost;

describe('seriesLabel', () => {
  it.each([
    ['Mirzapur - S1E2', 'Mirzapur'],
    ['Mirzapur: s2 finale', 'Mirzapur'],
    ['Panchayat - Ep 3', 'Panchayat'],
    ['Panchayat: EPISODE 4', 'Panchayat'],
    ['Plain title', 'Plain title'],
  ])('%p -> %p', (raw, label) => {
    expect(seriesLabel(raw)).toBe(label);
  });

  it('keeps the raw title when stripping would leave nothing', () => {
    expect(seriesLabel(' - S1')).toBe(' - S1');
  });
});

describe('exploreOrderColumn', () => {
  it('sorts popularity filters by views and the rest by date', () => {
    expect(exploreOrderColumn('popular')).toBe('view_count');
    expect(exploreOrderColumn('most_watched')).toBe('view_count');
    expect(exploreOrderColumn('latest')).toBe('created_at');
    expect(exploreOrderColumn(undefined)).toBe('created_at');
  });
});

describe('dedupeById', () => {
  it('keeps the first row for each id', () => {
    const a1 = { id: 'a', n: 1 };
    const a2 = { id: 'a', n: 2 };
    const b = { id: 'b', n: 3 };
    expect(dedupeById([a1, b, a2])).toEqual([a1, b]);
  });
});

describe('mergeFeed', () => {
  it('prefers the post over its preview, sorts newest first, and applies the limit', () => {
    const post = row('x', '2026-01-02');
    const previewOfPost = { ...row('x', '2026-01-02'), title: 'preview' };
    const older = row('y', '2026-01-01');
    const newer = row('z', '2026-01-03');

    expect(mergeFeed([post, older], [previewOfPost, newer], 10)).toEqual([newer, post, older]);
    expect(mergeFeed([post, older], [newer], 2)).toEqual([newer, post]);
  });
});

describe('groupByGenre: New This Week', () => {
  const now = Date.parse('2026-03-10T00:00:00Z');
  const make = (id: string, created_at: string) =>
    ({ id, created_at, status: 'approved', content_type: 'short' }) as ChannelPost;

  it('includes posts from the last 7 days only', () => {
    const fresh = make('f', '2026-03-04T00:00:00Z');
    const stale = make('s', '2026-03-02T00:00:00Z');
    expect(groupByGenre([fresh, stale], now)['New This Week']).toEqual([fresh]);
  });
});
