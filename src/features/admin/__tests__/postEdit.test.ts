import { diffPostForm, type PostForm } from '@/features/admin/postEdit';

const initial: PostForm = {
  title: 'Pilot',
  body: 'First episode',
  genre: 'Drama',
  durationMin: '42',
  releaseYear: '',
  seasonNumber: '',
  episodeNumber: '',
  episodeTitle: '',
  thumbnailUrl: 'thumbs/pilot.jpg',
};

describe('diffPostForm', () => {
  it('sends nothing when nothing changed, ignoring surrounding spaces', () => {
    expect(diffPostForm(initial, { ...initial, title: ' Pilot ' })).toEqual({
      patch: {},
      clear: [],
    });
  });

  it('sends only the changed fields, numbers as numbers', () => {
    expect(
      diffPostForm(initial, {
        ...initial,
        title: 'The Pilot',
        durationMin: '45',
        seasonNumber: '2',
      }),
    ).toEqual({ patch: { title: 'The Pilot', durationMin: 45, seasonNumber: 2 }, clear: [] });
  });

  it('clears a blanked field instead of sending an empty value', () => {
    expect(diffPostForm(initial, { ...initial, genre: '', thumbnailUrl: '  ' })).toEqual({
      patch: {},
      clear: ['genre', 'thumbnail_url'],
    });
  });

  it('never clears the title', () => {
    expect(diffPostForm(initial, { ...initial, title: '' })).toEqual({ patch: {}, clear: [] });
  });

  it('skips a number field that is not a number', () => {
    expect(diffPostForm(initial, { ...initial, durationMin: 'abc' })).toEqual({
      patch: {},
      clear: [],
    });
  });
});
