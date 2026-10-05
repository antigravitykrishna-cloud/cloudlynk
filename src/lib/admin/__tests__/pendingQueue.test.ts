import { attachLookups, isMissingFunction, unique } from '@/lib/admin/pendingQueue';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('unique', () => {
  it('drops repeats and keeps first-seen order', () => {
    expect(unique(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });
});

describe('attachLookups', () => {
  const at = '2026-01-01T00:00:00Z';

  it('adds emails and channel names, null when unknown', () => {
    const queue = attachLookups(
      {
        channels: [{ id: 'c1', name: 'News', owner_id: 'u1', description: null, created_at: at }],
        videos: [
          {
            id: 'v1',
            channel_id: 'c1',
            uploaded_by: 'u2',
            storage_path: 'p',
            title: null,
            file_size_bytes: null,
            duration_seconds: null,
            mime_type: null,
            created_at: at,
          },
        ],
        posts: [
          {
            id: 'p1',
            channel_id: 'c9',
            author_id: 'u1',
            title: null,
            content_type: 'movie',
            thumbnail_url: null,
            video_url: null,
            created_at: at,
          },
        ],
      },
      { u1: 'one@example.com' },
      { c1: 'News' },
    );

    expect(queue.channels[0].owner_email).toBe('one@example.com');
    expect(queue.videos[0]).toMatchObject({ channel_name: 'News', owner_email: null });
    expect(queue.posts[0]).toMatchObject({ channel_name: null, author_email: 'one@example.com' });
  });
});

describe('isMissingFunction', () => {
  it('recognises a missing RPC by code or message', () => {
    expect(isMissingFunction({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunction({ message: 'Could not find the function public.x' })).toBe(true);
  });

  it('is false for other errors and for no error', () => {
    expect(isMissingFunction({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });
});
