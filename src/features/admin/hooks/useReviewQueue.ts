import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { showAlert } from '@/components/ui/Feedback';
import { fireHaptic } from '@/components/ui/Press';
import { errorMessage } from '@/utils/errors';
import {
  adminModerationApi,
  type PendingChannel,
  type PendingLegacyVideo,
  type PendingPost,
} from '@/features/admin/api/adminModerationApi';
import { reviewNotifications } from '@/features/notifications/api/notificationsApi';

/**
 * The review queue behind the admin dashboard and the pending screens: new channels, new posts and
 * legacy channel videos, with approve and reject for each. Owners and authors are notified of the
 * outcome. Reloads whenever the screen comes into focus.
 *
 * A failed load is an alert, not an empty list: a queue that says "nothing here" after an error
 * teaches admins to stop checking while it fills up.
 */
export function useReviewQueue({ legacyVideos = false }: { legacyVideos?: boolean } = {}) {
  const [channels, setChannels] = useState<PendingChannel[]>([]);
  const [posts, setPosts] = useState<PendingPost[]>([]);
  const [videos, setVideos] = useState<PendingLegacyVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextChannels, nextPosts, nextVideos] = await Promise.all([
        adminModerationApi.listPendingChannels(),
        adminModerationApi.listPendingPosts(),
        legacyVideos ? adminModerationApi.listPendingLegacyVideos() : Promise.resolve([]),
      ]);
      setChannels(nextChannels);
      setPosts(nextPosts);
      setVideos(nextVideos);
    } catch (err) {
      showAlert('Could not load the review queue', errorMessage(err, 'Check your connection.'));
    } finally {
      setLoading(false);
    }
  }, [legacyVideos]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  /** Runs one review decision, then drops the item from its list. */
  async function decide(id: string, action: () => Promise<unknown>, remove: () => void) {
    setActingOn(id);
    try {
      await action();
      remove();
      fireHaptic('success');
    } catch (err) {
      fireHaptic('error');
      showAlert('Could not do that', errorMessage(err, 'Please try again.'));
    } finally {
      setActingOn(null);
    }
  }

  const ownerOf = (channel: PendingChannel) => channel.owner?.id ?? channel.owner_id;
  const channelNameOf = (post: PendingPost) => post.channel?.name ?? 'your channel';

  return {
    channels,
    posts,
    videos,
    loading,
    actingOn,
    reload: load,

    approveChannel: (channel: PendingChannel) =>
      decide(
        channel.id,
        async () => {
          await adminModerationApi.approveChannel(channel.id);
          await reviewNotifications.channelApproved(ownerOf(channel), channel.name, channel.id);
        },
        () => setChannels(list => list.filter(item => item.id !== channel.id)),
      ),

    rejectChannel: (channel: PendingChannel) =>
      decide(
        channel.id,
        async () => {
          await adminModerationApi.rejectChannel(channel.id);
          await reviewNotifications.channelRejected(ownerOf(channel), channel.name, channel.id);
        },
        () => setChannels(list => list.filter(item => item.id !== channel.id)),
      ),

    approvePost: (post: PendingPost) =>
      decide(
        post.id,
        async () => {
          await adminModerationApi.approvePost(post.id);
          await reviewNotifications.postApproved(
            post.author_id,
            channelNameOf(post),
            post.channel_id,
            post.id,
          );
        },
        () => setPosts(list => list.filter(item => item.id !== post.id)),
      ),

    rejectPost: (post: PendingPost, reason?: string) =>
      decide(
        post.id,
        async () => {
          await adminModerationApi.rejectPost(post.id, reason);
          await reviewNotifications.postRejected(
            post.author_id,
            channelNameOf(post),
            post.channel_id,
            post.id,
          );
        },
        () => setPosts(list => list.filter(item => item.id !== post.id)),
      ),

    setVideoStatus: (video: PendingLegacyVideo, status: 'approved' | 'rejected') =>
      decide(
        video.id,
        () => adminModerationApi.setLegacyVideoStatus(video.id, status),
        () => setVideos(list => list.filter(item => item.id !== video.id)),
      ),
  };
}
