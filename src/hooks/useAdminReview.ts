import { useCallback, useEffect, useState } from 'react';
import { showAlert } from '@/components/ui/Feedback';
import { NotificationService } from '@/lib/data/notifications';
import { PostService, type ChannelPost } from '@/lib/data/posts';
import { errorMessage } from '@/lib/errors';

export type ReviewChannel = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  owner_id: string;
  owner?: { id: string; full_name: string | null; email: string };
};

/**
 * The Admin Panel's review queue: pending channels and posts. Every decision notifies the owner
 * or author.
 */
export function useAdminReview(adminId: string | undefined) {
  const [channels, setChannels] = useState<ReviewChannel[]>([]);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  /** The id of the item whose decision is in flight. */
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pendingChannels, pendingPosts] = await Promise.all([
        PostService.getPendingChannels(),
        PostService.getPendingPosts(),
      ]);
      setChannels(pendingChannels as ReviewChannel[]);
      setPosts(pendingPosts);
    } catch (err) {
      showAlert('Error', errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /** Runs one decision with the item marked busy; failures are shown, not thrown. */
  const decide = async (id: string, action: () => Promise<void>) => {
    setReviewing(id);
    try {
      await action();
    } catch (err) {
      showAlert('Error', errorMessage(err));
    } finally {
      setReviewing(null);
    }
  };

  const confirmReject = (title: string, message: string, onReject: () => void) =>
    showAlert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: onReject },
    ]);

  const ownerOf = (ch: ReviewChannel) => ch.owner?.id ?? ch.owner_id;
  const channelNameOf = (post: ChannelPost) => post.channel?.name ?? 'your channel';

  const approveChannel = (ch: ReviewChannel) =>
    decide(ch.id, async () => {
      await PostService.approveChannel(ch.id);
      await NotificationService.channelApproved(ownerOf(ch), ch.name, ch.id);
      setChannels(prev => prev.filter(c => c.id !== ch.id));
      showAlert('✓ Approved', `"${ch.name}" is live. Owner notified.`);
    });

  const rejectChannel = (ch: ReviewChannel) =>
    confirmReject('Reject?', `"${ch.name}" will be suspended.`, () =>
      decide(ch.id, async () => {
        await PostService.rejectChannel(ch.id);
        await NotificationService.channelRejected(ownerOf(ch), ch.name, ch.id);
        setChannels(prev => prev.filter(c => c.id !== ch.id));
      }),
    );

  const approvePost = (post: ChannelPost) => {
    if (!adminId) return;
    return decide(post.id, async () => {
      await PostService.approvePost(post.id, adminId);
      await NotificationService.postApproved(
        post.author_id,
        channelNameOf(post),
        post.channel_id,
        post.id,
      );
      setPosts(prev => prev.filter(p => p.id !== post.id));
      showAlert('✓ Post approved', 'Author notified.');
    });
  };

  const rejectPost = (post: ChannelPost) => {
    if (!adminId) return;
    confirmReject('Reject post?', 'Author will be notified.', () =>
      decide(post.id, async () => {
        await PostService.rejectPost(post.id, adminId, 'Does not meet content guidelines.');
        await NotificationService.postRejected(
          post.author_id,
          channelNameOf(post),
          post.channel_id,
          post.id,
        );
        setPosts(prev => prev.filter(p => p.id !== post.id));
      }),
    );
  };

  return {
    channels,
    posts,
    loading,
    refreshing,
    refresh,
    reviewing,
    approveChannel,
    rejectChannel,
    approvePost,
    rejectPost,
  };
}
