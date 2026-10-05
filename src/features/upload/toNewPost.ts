import type { NewPost } from '@/features/content/api/postsApi';
import type { VideoDetails } from '@/features/upload/uploadQueue';

const toNumber = (value: string) => (value ? parseInt(value, 10) : undefined);

/** Turns the details typed into a video form into the post to create. */
export function toNewPost(
  details: VideoDetails,
  ids: { channelId: string; authorId: string; streamVideoUid?: string; fallbackTitle?: string },
  options: { saveAsDraft?: boolean } = {},
): NewPost {
  return {
    channelId: ids.channelId,
    authorId: ids.authorId,
    title: details.title || ids.fallbackTitle || '',
    body: details.body,
    contentType: details.contentType || 'movie',
    accessLevel: details.accessLevel,
    genre: details.genre || undefined,
    durationMin: toNumber(details.durationMin),
    seasonNumber: toNumber(details.seasonNo),
    episodeNumber: toNumber(details.episodeNo),
    episodeTitle: details.episodeTitle || undefined,
    releaseYear: toNumber(details.releaseYear),
    thumbnailUri: details.thumbnailUri ?? undefined,
    streamVideoUid: ids.streamVideoUid,
    seriesId: details.seriesId ?? undefined,
    saveAsDraft: options.saveAsDraft,
  };
}
