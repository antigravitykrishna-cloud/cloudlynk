import {
  carrySeriesForward,
  firstMissingTitle,
  newUploadFor,
  toQueueEntries,
  type NewUpload,
} from '@/features/upload/newUploads';

const video = (name: string) => ({ uri: `file:///${name}`, name, size: 1_000 });
const uploads = (...names: string[]) => names.map(name => newUploadFor(video(name)));

describe('newUploadFor', () => {
  it('starts as a premium movie titled after the file', () => {
    const upload = newUploadFor(video('The Lunchbox.mp4'));
    expect(upload.title).toBe('The Lunchbox');
    expect(upload.contentType).toBe('movie');
    expect(upload.accessLevel).toBe('premium');
  });
});

describe('carrySeriesForward', () => {
  const season = (): NewUpload[] => {
    const [first, ...rest] = uploads('e1.mp4', 'e2.mp4', 'e3.mp4');
    return [
      {
        ...first,
        contentType: 'series',
        seriesName: 'Panchayat',
        seasonNo: '2',
        episodeNo: '4',
        genre: 'Comedy',
      },
      ...rest,
    ];
  };

  it('fills in the later episodes and numbers them on from the first', () => {
    const [, second, third] = carrySeriesForward(season(), 0);
    expect(second).toMatchObject({
      contentType: 'series',
      seriesName: 'Panchayat',
      seasonNo: '2',
      genre: 'Comedy',
      episodeNo: '5',
    });
    expect(third.episodeNo).toBe('6');
  });

  it('leaves earlier uploads and other series alone', () => {
    const list = season();
    list[2] = { ...list[2], seriesName: 'Kota Factory' };
    const result = carrySeriesForward(list, 0);
    expect(result[0]).toBe(list[0]);
    expect(result[2].seriesName).toBe('Kota Factory');
  });

  it('only applies to series', () => {
    const list = uploads('a.mp4', 'b.mp4');
    expect(carrySeriesForward(list, 0)).toBe(list);
  });
});

describe('firstMissingTitle', () => {
  it('finds the first upload without a title', () => {
    const list = uploads('a.mp4', 'b.mp4');
    expect(firstMissingTitle(list)).toBe(-1);
    list[1] = { ...list[1], title: '   ' };
    expect(firstMissingTitle(list)).toBe(1);
  });
});

describe('toQueueEntries', () => {
  it('gives series episodes a series id and other content none', () => {
    const [movie, episode] = uploads('m.mp4', 'e.mp4');
    const [queuedMovie, queuedEpisode] = toQueueEntries(
      [movie, { ...episode, contentType: 'series', seriesName: ' Panchayat ' }],
      'channel-1',
    );
    expect(queuedMovie.seriesId).toBeNull();
    expect(queuedEpisode.seriesName).toBe('Panchayat');
    expect(queuedEpisode.seriesId).toMatch(/^local-/);
  });
});
