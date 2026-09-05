/**
 * v0.7.0 React hook wrapping the upload queue manager.
 * Subscribe to queue state, add/remove items, start/pause/resume uploads.
 * Respects premium limits via the auth profile.
 */

import { useState, useEffect, useCallback } from 'react';
import { UploadQueue, QueueState, QueueItem } from '../lib/uploadQueue';
import { useAuth } from './useAuth';

export type { QueueState, QueueItem } from '../lib/uploadQueue';

export function useUploadQueue(channelId: string | undefined) {
  const { user, isPaidUser } = useAuth();
  const [state, setState] = useState<QueueState>(UploadQueue.getState());

  // Subscribe to queue state changes
  useEffect(() => {
    const unsubscribe = UploadQueue.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  // Initialize queue from AsyncStorage on mount
  useEffect(() => {
    UploadQueue.init();
  }, []);

  const addToQueue = useCallback(async (entries: Parameters<typeof UploadQueue.addToQueue>[0]): Promise<number> => {
    if (!channelId || !user?.id) return 0;
    return UploadQueue.addToQueue(entries, channelId, user.id, isPaidUser);
  }, [channelId, user?.id, isPaidUser]);

  const removeFromQueue = useCallback(async (itemId: string): Promise<boolean> => {
    return UploadQueue.removeItem(itemId);
  }, []);

  const updateItem = useCallback(async (
    itemId: string,
    updates: Partial<Pick<QueueItem, 'title' | 'body' | 'contentType' | 'accessLevel' | 'genre' | 'durationMin' | 'seasonNo' | 'episodeNo' | 'episodeTitle' | 'releaseYear' | 'thumbnailUri' | 'channelId'>>
  ): Promise<boolean> => {
    return UploadQueue.updateItem(itemId, updates);
  }, []);

  const startUpload = useCallback(async () => {
    await UploadQueue.startUpload();
  }, []);

  const pauseUpload = useCallback(async () => {
    await UploadQueue.pauseUpload();
  }, []);

  const resumeUpload = useCallback(async () => {
    await UploadQueue.resumeUpload();
  }, []);

  const retryItem = useCallback(async (itemId: string): Promise<boolean> => {
    return UploadQueue.retryItem(itemId);
  }, []);

  const clearCompleted = useCallback(async () => {
    await UploadQueue.clearCompleted();
  }, []);

  return {
    /** Current queue state */
    queue: state,
    /** All items in the queue */
    items: state.items,
    /** Whether an upload is in progress */
    isUploading: state.isUploading,
    /** Number of items with completed/failed status */
    completedCount: state.items.filter(i => i.status === 'done').length,
    failedCount: state.items.filter(i => i.status === 'failed').length,
    queuedCount: state.items.filter(i => i.status === 'queued').length,
    /** Premium limit: 5 for free, unlimited for premium */
    maxItems: isPaidUser ? Infinity : 5,
    addToQueue,
    removeFromQueue,
    updateItem,
    startUpload,
    pauseUpload,
    resumeUpload,
    retryItem,
    clearCompleted,
  };
}
