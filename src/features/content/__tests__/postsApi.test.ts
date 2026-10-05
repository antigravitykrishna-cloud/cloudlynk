import { ChannelPost, PostService, defaultAccessLevel } from '@/features/content/api/postsApi';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

let nextId = 0;
function post(overrides: Partial<ChannelPost>): ChannelPost {
  nextId += 1;
  return {
    id: `p${nextId}`,
    status: 'approved',
    content_type: 'movie',
    ...overrides,
  } as ChannelPost;
}

describe('defaultAccessLevel', () => {
  it('makes movies and series premium, shorts and posts free', () => {
    expect(defaultAccessLevel('movie')).toBe('premium');
    expect(defaultAccessLevel('series')).toBe('premium');
    expect(defaultAccessLevel('short')).toBe('free');
    expect(defaultAccessLevel('post')).toBe('free');
  });
});

describe('PostService.groupByGenre', () => {
  it('ignores posts that are not approved', () => {
    const groups = PostService.groupByGenre([
      post({ status: 'pending' }),
      post({ status: 'rejected' }),
    ]);
    expect(groups).toEqual({});
  });

  it('keeps each content type in its own row', () => {
    const movie = post({ content_type: 'movie' });
    const short = post({ content_type: 'short' });
    const groups = PostService.groupByGenre([movie, short]);

    expect(groups.Movies).toEqual([movie]);
    expect(groups.Movies).not.toContain(short);
  });

  it('features one title per type', () => {
    const movies = [post({ content_type: 'movie' }), post({ content_type: 'movie' })];
    const short = post({ content_type: 'short' });
    const groups = PostService.groupByGenre([...movies, short]);

    expect(groups.Featured).toEqual([movies[0], short]);
  });

  it('gives each series its own row, episodes in order', () => {
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
    });
    const groups = PostService.groupByGenre([s2e1, e2, e1]);

    const seriesRows = Object.entries(groups).filter(([name]) => name.startsWith('Series'));
    expect(seriesRows).toHaveLength(1);
    expect(seriesRows[0][1]).toEqual([e1, e2, s2e1]);
  });
});
