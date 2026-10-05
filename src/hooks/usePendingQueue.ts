import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { showAlert } from '@/components/ui/Feedback';
import { fireHaptic } from '@/components/ui/Press';
import { errorMessage } from '@/lib/errors';
import {
  approvePost,
  loadPendingQueue,
  rejectPost,
  setChannelStatus,
  setVideoStatus,
  videoPreviewUrl,
  type PendingChannel,
  type PendingPost,
  type PendingQueue,
  type PendingVideo,
} from '@/lib/admin/pendingQueue';

const EMPTY: PendingQueue = { channels: [], videos: [], posts: [] };

/** Runs a moderation action, then removes the item from its list and confirms. */
async function moderate(
  action: () => Promise<void>,
  onDone: () => void,
  haptic: 'success' | 'warning',
  title: string,
  message: string,
  failure: string,
) {
  try {
    await action();
    onDone();
    fireHaptic(haptic);
    showAlert(title, message);
  } catch (err: unknown) {
    fireHaptic('error');
    showAlert('Error', errorMessage(err, failure));
  }
}

function confirmReject(title: string, message: string, onReject: () => Promise<void>) {
  showAlert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reject', style: 'destructive', onPress: onReject },
  ]);
}

async function openUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch (err: unknown) {
    fireHaptic('error');
    showAlert('Error', errorMessage(err, 'Could not open video.'));
  }
}

/** The admin review queue, reloaded on focus, with approve / reject / preview for each item. */
export function usePendingQueue(isAdmin: boolean) {
  const [queue, setQueue] = useState<PendingQueue>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setQueue(await loadPendingQueue());
    } catch (err) {
      if (__DEV__) console.error('loadPending error:', err);
      // A moderation queue that renders "nothing here" after a failed
      // fetch is worse than one that errors: the admin concludes there is
      // nothing to review and stops checking, while the queue fills up.
      showAlert(
        'Could not load pending channels',
        errorMessage(err, 'Check your connection and try again.'),
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const drop = <K extends keyof PendingQueue>(key: K, id: string) =>
    setQueue(q => ({ ...q, [key]: q[key].filter(item => item.id !== id) }));

  const channel = {
    approve: (c: PendingChannel) =>
      moderate(
        () => setChannelStatus(c.id, 'active'),
        () => drop('channels', c.id),
        'success',
        'Approved',
        `"${c.name}" is now active.`,
        'Approve failed',
      ),
    reject: (c: PendingChannel) =>
      confirmReject('Reject Channel', `Are you sure? This will mark "${c.name}" as rejected.`, () =>
        moderate(
          () => setChannelStatus(c.id, 'rejected'),
          () => drop('channels', c.id),
          'warning',
          'Rejected',
          `"${c.name}" has been rejected.`,
          'Reject failed',
        ),
      ),
  };

  const video = {
    play: async (v: PendingVideo) => {
      try {
        const url = await videoPreviewUrl(v.storage_path);
        if (!url) {
          fireHaptic('error');
          showAlert('Error', 'Could not generate preview URL.');
          return;
        }
        await Linking.openURL(url);
      } catch (err: unknown) {
        fireHaptic('error');
        showAlert('Error', errorMessage(err, 'Could not open video.'));
      }
    },
    approve: (v: PendingVideo) =>
      moderate(
        () => setVideoStatus(v.id, 'approved'),
        () => drop('videos', v.id),
        'success',
        'Approved',
        `Video "${v.title ?? 'Untitled'}" is now approved.`,
        'Approve failed',
      ),
    reject: (v: PendingVideo) =>
      confirmReject(
        'Reject Video',
        `Reject "${v.title ?? 'Untitled'}"? Enter a reason if needed.`,
        () =>
          moderate(
            () => setVideoStatus(v.id, 'rejected'),
            () => drop('videos', v.id),
            'warning',
            'Rejected',
            'Video has been rejected.',
            'Reject failed',
          ),
      ),
  };

  const post = {
    play: (p: PendingPost) => {
      if (!p.video_url) {
        showAlert('No video', 'This post has no video URL attached.');
        return;
      }
      return openUrl(p.video_url);
    },
    approve: (p: PendingPost) =>
      moderate(
        () => approvePost(p.id),
        () => drop('posts', p.id),
        'success',
        'Approved',
        `"${p.title ?? 'Untitled'}" is now approved.`,
        'Approve failed',
      ),
    reject: (p: PendingPost) =>
      confirmReject('Reject Post', `Reject "${p.title ?? 'Untitled'}"?`, () =>
        moderate(
          () => rejectPost(p.id),
          () => drop('posts', p.id),
          'warning',
          'Rejected',
          'Post has been rejected.',
          'Reject failed',
        ),
      ),
  };

  return { queue, loading, refreshing, refresh, channel, video, post };
}
