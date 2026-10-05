import {
  blankEntry,
  deriveSeriesId,
  EntryForm,
  progressLabel,
  propagateSeries,
  slotsLeft,
  toQueueEntry,
  touchesSeriesFields,
} from '@/lib/video/uploadForm';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const video = (name: string) => ({ uri: `file:///${name}`, name, size: 1024 });

describe('blankEntry', () => {
  it('starts as a premium movie titled after the file', () => {
    const e = blankEntry(video('My Film.final.mp4'), 2026);
    expect(e.title).toBe('My Film.final');
    expect(e.contentType).toBe('movie');
    expect(e.accessLevel).toBe('premium');
    expect(e.releaseYear).toBe('2026');
  });
});

describe('deriveSeriesId', () => {
  const channel = '0123456789abcdef';

  it('ignores case, spacing and punctuation', () => {
    expect(deriveSeriesId(channel, 'Breaking Bad')).toBe(
      deriveSeriesId(channel, ' breaking  bad! '),
    );
  });

  it('differs between series and between channels', () => {
    expect(deriveSeriesId(channel, 'A')).not.toBe(deriveSeriesId(channel, 'B'));
    expect(deriveSeriesId(channel, 'A')).not.toBe(deriveSeriesId('fedcba9876543210', 'A'));
  });

  it('has a fixed shape', () => {
    expect(deriveSeriesId(channel, 'A')).toMatch(/^local-01234567-[0-9a-f]{8}$/);
  });
});

describe('touchesSeriesFields', () => {
  it('is true only for fields that carry over', () => {
    expect(touchesSeriesFields({ seriesName: 'x' })).toBe(true);
    expect(touchesSeriesFields({ genre: 'Drama' })).toBe(true);
    expect(touchesSeriesFields({ title: 'x', body: 'y' })).toBe(false);
  });
});

describe('propagateSeries', () => {
  const series = (patch: Partial<EntryForm>): EntryForm => ({
    ...blankEntry(video('ep.mp4'), 2026),
    ...patch,
  });

  it('copies series details forward and numbers episodes on', () => {
    const entries = [
      series({ contentType: 'series', seriesName: 'Show', seasonNo: '2', episodeNo: '3' }),
      series({}),
      series({}),
    ];
    const out = propagateSeries(entries, 0);
    expect(out[1]).toMatchObject({ contentType: 'series', seriesName: 'Show', seasonNo: '2' });
    expect(out.map(e => e.episodeNo)).toEqual(['3', '4', '5']);
  });

  it('leaves earlier entries and differently named series alone', () => {
    const before = series({ title: 'before' });
    const other = series({ seriesName: 'Other show' });
    const entries = [
      before,
      series({ contentType: 'series', seriesName: 'Show', episodeNo: '1' }),
      other,
    ];
    const out = propagateSeries(entries, 1);
    expect(out[0]).toBe(before);
    expect(out[2]).toBe(other);
  });

  it('does nothing when the source is not a series', () => {
    const entries = [series({}), series({})];
    expect(propagateSeries(entries, 0)).toBe(entries);
  });
});

describe('toQueueEntry', () => {
  it('trims text and gives series episodes a series id', () => {
    const e = {
      ...blankEntry(video('a.mp4')),
      title: '  Pilot ',
      contentType: 'series' as const,
      seriesName: ' Show ',
    };
    const q = toQueueEntry(e, 'channel-1');
    expect(q.title).toBe('Pilot');
    expect(q.seriesName).toBe('Show');
    expect(q.seriesId).toBe(deriveSeriesId('channel-1', 'Show'));
  });

  it('gives no series id to a movie', () => {
    expect(toQueueEntry(blankEntry(video('a.mp4')), 'c').seriesId).toBeNull();
  });
});

describe('slotsLeft', () => {
  it('is unlimited on Premium', () => {
    expect(slotsLeft(12, Infinity, 50, 3)).toBe(12);
  });

  it('counts queued and on-screen videos against the free limit', () => {
    expect(slotsLeft(5, 10, 4, 3)).toBe(3);
    expect(slotsLeft(5, 10, 8, 3)).toBe(0);
  });
});

describe('progressLabel', () => {
  it('shows a percentage while uploading', () => {
    expect(progressLabel('uploading', 0.426)).toBe('43%');
  });

  it('names the other states', () => {
    expect(progressLabel('done', 1)).toBe('✓ Done');
    expect(progressLabel('over_limit', 0)).toBe('Too large');
    expect(progressLabel('paused', 0)).toBe('paused');
  });
});
