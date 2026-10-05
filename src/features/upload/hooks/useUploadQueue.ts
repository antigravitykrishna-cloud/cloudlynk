import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { VideoMeta } from '@/features/upload/api/streamUploadApi';
import {
  FREE_QUEUE_LIMIT,
  UploadQueue,
  type QueueState,
  type VideoDetails,
} from '@/features/upload/uploadQueue';

export type { EditableDetails, QueueItem } from '@/features/upload/uploadQueue';

/**
 * The upload queue for screens: its live state and the actions on it. `channelId` is where newly
 * added videos will be published.
 */
export function useUploadQueue(channelId: string | undefined) {
  const { user, isPaidUser } = useAuth();
  const [queue, setQueue] = useState<QueueState>(UploadQueue.getState());

  useEffect(() => UploadQueue.subscribe(setQueue), []);
  useEffect(() => {
    UploadQueue.init();
  }, []);

  /** Queues videos for `channelId`; resolves with the ids of the items added. */
  const add = useCallback(
    async (entries: (Partial<VideoDetails> & { video: VideoMeta })[]): Promise<string[]> => {
      if (!channelId || !user) return [];
      const added = await UploadQueue.add(entries, channelId, user.id, isPaidUser);
      return added.map(item => item.id);
    },
    [channelId, user, isPaidUser],
  );

  const count = (status: string) => queue.items.filter(i => i.status === status).length;

  return {
    items: queue.items,
    isUploading: queue.isUploading,
    queuedCount: count('queued'),
    completedCount: count('done'),
    failedCount: count('failed'),
    /** How many files can be queued at once: FREE_QUEUE_LIMIT, or unlimited with a plan. */
    maxItems: isPaidUser ? Infinity : FREE_QUEUE_LIMIT,
    add,
    remove: UploadQueue.remove,
    update: UploadQueue.update,
    start: UploadQueue.start,
    pause: UploadQueue.pause,
    retry: UploadQueue.retry,
    clearFinished: UploadQueue.clearFinished,
  };
}
