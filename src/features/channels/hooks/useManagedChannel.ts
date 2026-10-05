import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { showAlert } from '@/components/ui/Feedback';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useOnAccountChange } from '@/features/auth/hooks/useOnAccountChange';
import { channelsApi, type Channel } from '@/features/channels/api/channelsApi';
import { postsApi } from '@/features/content/api/postsApi';
import type { ChannelPost } from '@/features/content/model';

/**
 * A channel its owner (or an admin) is managing: the channel, all its posts, and the edits allowed
 * on them. Anyone else is sent back to the Channels tab; the server enforces the same rule.
 */
export function useManagedChannel(channelId: string) {
  const router = useRouter();
  const { user, profile, isAdmin } = useAuth();
  const userId = user?.id;
  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);

  const leave = useCallback(() => router.replace('/(tabs)/channels'), [router]);

  useOnAccountChange(() => {
    setChannel(null);
    setPosts([]);
    setLoading(true);
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const found = await channelsApi.get(channelId, { signedIn: true });
        if (!found) throw new Error('Channel not found');
        if (cancelled) return;
        setChannel(found);
        setPosts(await postsApi.listChannelPosts(channelId, userId).catch(() => []));
      } catch {
        showAlert('Error', 'Failed to load channel');
        leave();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId, userId, leave]);

  // Wait for the profile, so an admin is not turned away before isAdmin is known.
  useEffect(() => {
    if (!profile || !channel || !userId) return;
    if (channel.owner_id !== userId && !isAdmin) {
      showAlert('Access Denied', 'You can only manage your own channels.');
      leave();
    }
  }, [profile, channel, userId, isAdmin, leave]);

  const saveDetails = async (name: string, description: string) => {
    await channelsApi.update(channelId, name, description);
    setChannel(current => (current ? { ...current, name, description } : current));
  };

  const deleteChannel = async () => {
    await channelsApi.remove(channelId);
    leave();
  };

  const deletePost = async (postId: string) => {
    await postsApi.remove(postId);
    setPosts(current => current.filter(p => p.id !== postId));
  };

  return { channel, posts, loading, saveDetails, deleteChannel, deletePost };
}
