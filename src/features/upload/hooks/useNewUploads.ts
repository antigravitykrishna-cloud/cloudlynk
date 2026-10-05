import { useCallback, useEffect, useRef, useState } from 'react';
import { showAlert } from '@/components/ui/Feedback';
import { pickVideoFiles } from '@/lib/mediaPicker';
import { useUploadQueue } from '@/features/upload/hooks/useUploadQueue';
import {
  SERIES_FIELDS,
  carrySeriesForward,
  firstMissingTitle,
  newUploadFor,
  toQueueEntries,
  type NewUpload,
} from '@/features/upload/newUploads';
import { errorMessage } from '@/utils/errors';

/** Wait this long after typing stops before copying series details to later episodes. */
const CARRY_FORWARD_DELAY_MS = 250;

/**
 * The Add Content screen's state: the videos picked so far with their details, then, once
 * submitted, the progress of exactly those uploads.
 */
export function useNewUploads(channelId: string | undefined) {
  const queue = useUploadQueue(channelId);
  const [uploads, setUploads] = useState<NewUpload[]>([]);
  const [picking, setPicking] = useState(false);
  const [submittedIds, setSubmittedIds] = useState<string[] | null>(null);
  const carryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (carryTimer.current) clearTimeout(carryTimer.current);
    },
    [],
  );

  const update = useCallback((index: number, patch: Partial<NewUpload>) => {
    setUploads(current => current.map((u, i) => (i === index ? { ...u, ...patch } : u)));

    // Copying to later episodes on every keystroke re-renders their inputs mid-typing, which drops
    // characters on some Android keyboards. Wait until typing pauses.
    if (!SERIES_FIELDS.some(field => field in patch)) return;
    if (carryTimer.current) clearTimeout(carryTimer.current);
    carryTimer.current = setTimeout(
      () => setUploads(current => carrySeriesForward(current, index)),
      CARRY_FORWARD_DELAY_MS,
    );
  }, []);

  const remove = useCallback((index: number) => {
    setUploads(current => current.filter((_, i) => i !== index));
  }, []);

  /** Opens the file picker and adds what fits under the free queue limit. */
  const pickVideos = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const videos = await pickVideoFiles({ multiple: true });
      if (videos.length === 0) return;

      const slotsLeft =
        queue.maxItems === Infinity
          ? videos.length
          : Math.max(0, queue.maxItems - queue.queuedCount - uploads.length);
      if (slotsLeft === 0) {
        showAlert(
          'Queue full',
          `Free plan allows up to ${queue.maxItems} videos. Upgrade to add more.`,
        );
        return;
      }

      setUploads(current => [...current, ...videos.slice(0, slotsLeft).map(newUploadFor)]);
      if (videos.length > slotsLeft) {
        showAlert(
          'Limit reached',
          `${videos.length - slotsLeft} file(s) skipped — free plan limit of ${queue.maxItems}.`,
        );
      }
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not pick videos'));
    } finally {
      setPicking(false);
    }
  };

  /** Validates, queues everything and starts uploading. */
  const submit = async () => {
    if (!channelId) {
      showAlert('Error', 'No channel selected.');
      return;
    }
    if (uploads.length === 0) {
      showAlert('No videos', 'Add at least one video first.');
      return;
    }
    const missing = firstMissingTitle(uploads);
    if (missing !== -1) {
      showAlert('Title required', `Please add a title for video ${missing + 1}.`);
      return;
    }

    try {
      const ids = await queue.add(toQueueEntries(uploads, channelId));
      if (ids.length === 0) {
        showAlert('Queue full', 'Could not add videos — queue is at capacity.');
        return;
      }
      setSubmittedIds(ids);
      await queue.start();
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Failed to queue uploads'));
    }
  };

  const submittedItems = submittedIds
    ? queue.items.filter(item => submittedIds.includes(item.id))
    : [];
  const allFinished =
    submittedItems.length > 0 &&
    submittedItems.every(item => ['done', 'failed', 'over_limit'].includes(item.status));

  return {
    uploads,
    picking,
    pickVideos,
    update,
    remove,
    submit,
    submitted: submittedIds !== null,
    submittedItems,
    allFinished,
    isUploading: queue.isUploading,
  };
}
