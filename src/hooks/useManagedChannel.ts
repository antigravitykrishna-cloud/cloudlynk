import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { showAlert } from '@/components/ui/Feedback';
import { useAuth } from '@/hooks/useAuth';
import { ChannelService } from '@/lib/data/channels';
import { PostService, type ChannelPost } from '@/lib/data/posts';
import { errorMessage } from '@/lib/errors';
import type { Tables } from '@/lib/database.types';

const CHANNELS = '/(tabs)/channels';

/**
 * A channel and its posts for the owner's manage screen. Sends anyone who is neither the owner
 * nor an admin back to the Channels tab.
 */
export function useManagedChannel(id: string) {
  const router = useRouter();
  const { user, profile, isAdmin } = useAuth();
  const [channel, setChannel] = useState<Tables<'channels'> | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChannel = useCallback(async () => {
    try {
      setChannel(await ChannelService.getChannelForManage(id));
    } catch {
      showAlert('Error', 'Failed to load channel');
      router.replace(CHANNELS);
    }
  }, [id, router]);

  const loadPosts = useCallback(async () => {
    if (!user) return;
    try {
      setPosts(await PostService.getChannelPosts(id, user.id));
    } catch (err) {
      if (__DEV__) console.error('Failed to load posts:', err);
    }
  }, [id, user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      await loadChannel();
      await loadPosts();
      setLoading(false);
    })();
  }, [user, loadChannel, loadPosts]);

  // A different account signed in: drop the previous account's data at once.
  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== user?.id) {
      setChannel(null);
      setPosts([]);
      setLoading(true);
    }
    prevUserIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    if (profile === null) return;
    if (channel && user && channel.owner_id !== user.id && !isAdmin) {
      showAlert('Access Denied', 'You can only manage your own channels.');
      router.replace(CHANNELS);
    }
  }, [channel, user, isAdmin, profile, router]);

  /** Saves name and description. Resolves true on success. */
  const save = async (name: string, description: string): Promise<boolean> => {
    if (!name.trim()) {
      showAlert('Error', 'Channel name cannot be empty');
      return false;
    }
    try {
      setChannel(await ChannelService.updateChannel(id, name.trim(), description.trim()));
      showAlert('Success', 'Channel updated successfully');
      return true;
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Failed to update channel'));
      return false;
    }
  };

  const deleteChannel = () =>
    showAlert(
      'Delete Channel',
      'Are you sure you want to delete this channel? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ChannelService.deleteChannel(id);
              showAlert('Deleted', 'Channel has been deleted.');
              router.replace(CHANNELS);
            } catch (err) {
              showAlert('Error', errorMessage(err, 'Failed to delete channel'));
            }
          },
        },
      ],
    );

  const deletePost = (post: ChannelPost) =>
    showAlert('Delete Post', `Are you sure you want to delete "${post.title || 'Untitled'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await PostService.deletePost(post.id);
            setPosts(prev => prev.filter(p => p.id !== post.id));
          } catch (err) {
            showAlert('Error', errorMessage(err, 'Failed to delete post'));
          }
        },
      },
    ]);

  return { channel, posts, loading, isAdmin, save, deleteChannel, deletePost };
}
