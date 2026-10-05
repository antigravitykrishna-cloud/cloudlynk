import { defaultAccessLevel, type ChannelPost } from '@/features/content/model';
import { groupIntoShelves, sortShelves } from '@/features/content/shelves';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const OLD = '2026-01-01T00:00:00Z';

let nextId = 0;
function post(overrides: Partial<ChannelPost>): ChannelPost {
  nextId += 1;
  return {
    id: `p${nextId}`,
    status: 'approved',
    content_type: 'movie',
    created_at: OLD,
    ...overrides,
  } as ChannelPost;
}

const titles = (posts: ChannelPost[]) => groupIntoShelves(posts, NOW).map(s => s.title);
const shelf = (posts: ChannelPost[], title: string) =>
  groupIntoShelves(posts, NOW).find(s => s.title === title)?.items;

describe('defaultAccessLevel', () => {
  it('makes movies and series premium, shorts and posts free', () => {
    expect(defaultAccessLevel('movie')).toBe('premium');
    expect(defaultAccessLevel('series')).toBe('premium');
    expect(defaultAccessLevel('short')).toBe('free');
    expect(defaultAccessLevel('post')).toBe('free');
  });
});

describe('groupIntoShelves', () => {
  it('ignores posts that are not approved', () => {
    expect(
      groupIntoShelves([post({ status: 'pending' }), post({ status: 'rejected' })], NOW),
    ).toEqual([]);
  });

  it('keeps each content type on its own shelf', () => {
    const movie = post({ content_type: 'movie' });
    const short = post({ content_type: 'short' });
    expect(shelf([movie, short], 'Movies')).toEqual([movie]);
    expect(shelf([movie, short], 'Shorts')).toEqual([short]);
  });

  it('features one title per type', () => {
    const movies = [post({ content_type: 'movie' }), post({ content_type: 'movie' })];
    const short = post({ content_type: 'short' });
    expect(shelf([...movies, short], 'Featured')).toEqual([movies[0], short]);
  });

  it('gives each series its own shelf, episodes in order', () => {
    const e2 = post({
      content_type: 'series',
      series_id: 's1',
      season_number: 1,
      episode_number: 2,
    });
    const e1 = post({
      content_type: 'series',
      series_id: 's1',
      season_number: 1,
      episode_number: 1,
    });
    const s2e1 = post({
      content_type: 'series',
      series_id: 's1',
      season_number: 2,
      episode_number: 1,
      title: 'Mirzapur - S2E1',
    });
    const shelves = groupIntoShelves([s2e1, e2, e1], NOW).filter(s => s.title.startsWith('Series'));
    expect(shelves).toHaveLength(1);
    expect(shelves[0].items).toEqual([e1, e2, s2e1]);
  });

  it('names a series shelf after the series, not the episode', () => {
    const episode = post({ content_type: 'series', series_id: 's9', title: 'Panchayat - S1E1' });
    expect(titles([episode])).toContain('Series: Panchayat');
  });

  it('orders shelves: featured, movies, series, shorts, genres, then new this week', () => {
    const shelves = titles([
      post({ content_type: 'short', genre: 'Comedy' }),
      post({ content_type: 'series', series_id: 's1', title: 'Show' }),
      post({
        content_type: 'movie',
        genre: 'Drama',
        created_at: new Date(NOW - 3_600_000).toISOString(),
      }),
    ]);
    expect(shelves).toEqual([
      'Featured',
      'Movies',
      'Series: Show',
      'Shorts',
      'Drama',
      'Comedy',
      'New This Week',
    ]);
  });
});

describe('sortShelves', () => {
  const a = post({ created_at: '2026-01-01T00:00:00Z', view_count: 50 });
  const b = post({ created_at: '2026-03-01T00:00:00Z', view_count: 5 });
  const shelves = [{ title: 'Movies', items: [a, b] }];

  it('leaves the order alone for "all"', () => {
    expect(sortShelves(shelves, 'all')[0].items).toEqual([a, b]);
  });

  it('puts the newest first for "latest"', () => {
    expect(sortShelves(shelves, 'latest')[0].items).toEqual([b, a]);
  });

  it('puts the most viewed first for the popularity sorts', () => {
    expect(sortShelves(shelves, 'popular')[0].items).toEqual([a, b]);
    expect(sortShelves(shelves, 'most_watched')[0].items).toEqual([a, b]);
  });
});
