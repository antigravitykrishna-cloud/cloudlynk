import { AccessLevel, ContentType, defaultAccessLevel } from '@/lib/data/posts';
import type { QueueItemStatus } from './uploadQueue';

export type PickedVideo = { uri: string; name: string; size: number };

/** One video's details on the Add Content screen, as typed (numbers stay strings until queued). */
export type EntryForm = {
  video: PickedVideo;
  thumbnailUri: string | null;
  contentType: ContentType;
  /** Whether viewers need an active premium plan to watch this. Defaults by content type
   *  (movies/series premium, shorts/posts free) but the creator can override it. */
  accessLevel: AccessLevel;
  title: string;
  body: string;
  genre: string;
  durationMin: string;
  seriesName: string;
  seasonNo: string;
  episodeNo: string;
  episodeTitle: string;
  releaseYear: string;
};

export function blankEntry(video: PickedVideo, year = new Date().getFullYear()): EntryForm {
  return {
    video,
    thumbnailUri: null,
    contentType: 'movie',
    accessLevel: defaultAccessLevel('movie'),
    title: video.name.replace(/\.[^.]+$/, ''),
    body: '',
    genre: '',
    durationMin: '',
    seriesName: '',
    seasonNo: '',
    episodeNo: '',
    episodeTitle: '',
    releaseYear: String(year),
  };
}

/**
 * A stable id for a series within a channel, so episodes uploaded together (or later, under the
 * same name) group into one row. Case, spacing and punctuation in the name do not matter.
 */
export function deriveSeriesId(channelId: string, seriesName: string): string {
  const slug = seriesName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  let hash = 5381;
  const str = `${channelId}:${slug}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return `local-${channelId.slice(0, 8)}-${hash.toString(16).padStart(8, '0')}`;
}

/** Fields that, when set on a series episode, carry over to the episodes after it. */
const SERIES_FIELDS = ['contentType', 'seriesName', 'seasonNo', 'genre', 'releaseYear'] as const;

export function touchesSeriesFields(patch: Partial<EntryForm>): boolean {
  return SERIES_FIELDS.some(field => field in patch);
}

/**
 * Copies a series episode's series details to the entries after it and numbers their episodes on
 * from it. Entries whose series name the person has already changed to something else are left
 * alone.
 */
export function propagateSeries(entries: EntryForm[], sourceIdx: number): EntryForm[] {
  const source = entries[sourceIdx];
  if (!source || source.contentType !== 'series') return entries;

  let nextEp = parseInt(source.episodeNo || '1');
  return entries.map((e, i) => {
    if (i <= sourceIdx) return e;
    const isUncustomised =
      !e.seriesName ||
      source.seriesName.startsWith(e.seriesName) ||
      e.seriesName === source.seriesName;
    if (!isUncustomised) return e;
    return {
      ...e,
      contentType: 'series',
      seriesName: source.seriesName,
      seasonNo: source.seasonNo,
      genre: source.genre,
      releaseYear: source.releaseYear,
      episodeNo: String(++nextEp),
    };
  });
}

/** The form as the upload queue takes it: trimmed text and a series id for series episodes. */
export function toQueueEntry(e: EntryForm, channelId: string) {
  const seriesName = e.seriesName.trim();
  return {
    video: e.video,
    title: e.title.trim(),
    body: e.body.trim(),
    contentType: e.contentType,
    accessLevel: e.accessLevel,
    genre: e.genre,
    durationMin: e.durationMin,
    seasonNo: e.seasonNo,
    episodeNo: e.episodeNo,
    episodeTitle: e.episodeTitle,
    releaseYear: e.releaseYear,
    thumbnailUri: e.thumbnailUri,
    seriesName,
    seriesId:
      e.contentType === 'series' && seriesName ? deriveSeriesId(channelId, seriesName) : null,
  };
}

/** How many more videos fit on the plan, counting those already queued and on screen. */
export function slotsLeft(
  picked: number,
  maxItems: number,
  queuedCount: number,
  onScreen: number,
): number {
  return maxItems === Infinity ? picked : Math.max(0, maxItems - queuedCount - onScreen);
}

export function isFinished(status: QueueItemStatus): boolean {
  return status === 'done' || status === 'failed' || status === 'over_limit';
}

export function progressLabel(status: QueueItemStatus, progress: number): string {
  switch (status) {
    case 'done':
      return '✓ Done';
    case 'failed':
      return '✕ Failed';
    case 'uploading':
      return `${Math.round(progress * 100)}%`;
    case 'queued':
      return 'Queued';
    case 'over_limit':
      return 'Too large';
    default:
      return status;
  }
}
