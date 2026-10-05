import { defaultAccessLevel } from '@/features/content/model';
import type { VideoMeta } from '@/features/upload/api/streamUploadApi';
import { seriesIdFor } from '@/features/upload/seriesId';
import type { VideoDetails } from '@/features/upload/uploadQueue';

// Videos picked on the Add Content screen, before they join the upload queue.

export type NewUpload = Omit<VideoDetails, 'seriesId'> & { video: VideoMeta };

/** An empty form: a premium movie released this year. */
export function blankDetails(): Omit<VideoDetails, 'seriesId'> {
  return {
    thumbnailUri: null,
    contentType: 'movie',
    accessLevel: defaultAccessLevel('movie'),
    title: '',
    body: '',
    genre: '',
    durationMin: '',
    seriesName: '',
    seasonNo: '',
    episodeNo: '',
    episodeTitle: '',
    releaseYear: String(new Date().getFullYear()),
  };
}

/** Details for a freshly picked file, titled after the file name. */
export function newUploadFor(video: VideoMeta): NewUpload {
  return { ...blankDetails(), video, title: video.name.replace(/\.[^.]+$/, '') };
}

/** Changing one of these on an episode carries it over to the episodes picked after it. */
export const SERIES_FIELDS: (keyof NewUpload)[] = [
  'contentType',
  'seriesName',
  'seasonNo',
  'genre',
  'releaseYear',
];

/**
 * Picking a whole season at once means typing the series details once. The uploads after
 * `sourceIndex` take its series name, season, genre and year, with episode numbers counting up from
 * its own. An upload already given a different series name is left alone.
 */
export function carrySeriesForward(uploads: NewUpload[], sourceIndex: number): NewUpload[] {
  const source = uploads[sourceIndex];
  if (!source || source.contentType !== 'series') return uploads;

  let episode = parseInt(source.episodeNo, 10) || 1;
  return uploads.map((upload, index) => {
    if (index <= sourceIndex) return upload;
    const sameSeries =
      !upload.seriesName ||
      upload.seriesName === source.seriesName ||
      // Still being typed on the source: "Break" is on its way to "Breaking Bad".
      source.seriesName.startsWith(upload.seriesName);
    if (!sameSeries) return upload;
    episode += 1;
    return {
      ...upload,
      contentType: 'series',
      seriesName: source.seriesName,
      seasonNo: source.seasonNo,
      genre: source.genre,
      releaseYear: source.releaseYear,
      episodeNo: String(episode),
    };
  });
}

/** The index of the first upload without a title, or -1. */
export function firstMissingTitle(uploads: NewUpload[]): number {
  return uploads.findIndex(upload => !upload.title.trim());
}

/** The details as they are saved: trimmed text, and the series id for an episode. */
export function finalizeDetails(
  details: Omit<VideoDetails, 'seriesId'>,
  channelId: string,
): VideoDetails {
  const seriesName = details.seriesName.trim();
  return {
    ...details,
    title: details.title.trim(),
    body: details.body.trim(),
    seriesName,
    seriesId:
      details.contentType === 'series' && seriesName ? seriesIdFor(channelId, seriesName) : null,
  };
}

/** The uploads as queue entries. */
export function toQueueEntries(uploads: NewUpload[], channelId: string) {
  return uploads.map(upload => ({ ...finalizeDetails(upload, channelId), video: upload.video }));
}
