import { useCallback, useEffect, useMemo, useState } from 'react';
import { showAlert } from '@/components/ui/Feedback';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useOnAccountChange } from '@/features/auth/hooks/useOnAccountChange';
import { channelsApi, type Channel } from '@/features/channels/api/channelsApi';
import { safetyApi } from '@/features/channels/api/safetyApi';
import { postsApi } from '@/features/content/api/postsApi';
import type { ChannelPost } from '@/features/content/model';
import { groupIntoShelves } from '@/features/content/shelves';

/**
 * A channel page's data: the channel, whether the viewer is a member, and its posts grouped into
 * shelves. Signed-out visitors see listings only. People without a plan also see the premium
 * titles as locked previews, so they know what a plan would unlock. Uploaders the viewer blocked
 * are left out.
 */
export function useChannelDetail(channelId: string | undefined) {
  const { user, isAdmin, isPaidUser } = useAuth();
  const userId = user?.id;
  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);

  useOnAccountChange(() => {
    setChannel(null);
    setPosts([]);
    setIsMember(false);
    setLoading(true);
  });

  const load = useCallback(async () => {
    if (!channelId) return;
    try {
      if (!userId) {
        const [found, listed] = await Promise.all([
          channelsApi.get(channelId, { signedIn: false }),
          postsApi.listChannelPostsForGuest(channelId),
        ]);
        setChannel(found);
        setIsMember(false);
        setPosts(listed as ChannelPost[]);
        return;
      }

      const found = await channelsApi.get(channelId, { signedIn: true });
      setChannel(found);
      // Owners belong to their channel even without a membership row.
      setIsMember(found?.owner_id === userId || (await channelsApi.isMember(channelId, userId)));

      const hasPlan = isPaidUser || isAdmin;
      const [playable, blockedIds, previews] = await Promise.all([
        postsApi.listChannelPosts(channelId, userId),
        safetyApi.listBlockedUserIds(userId).catch(() => [] as string[]),
        hasPlan ? Promise.resolve([]) : postsApi.listPremiumPreviews(channelId).catch(() => []),
      ]);

      const seen = new Set(playable.map(p => p.id));
      const blocked = new Set(blockedIds);
      setPosts(
        [...playable, ...(previews as ChannelPost[]).filter(p => !seen.has(p.id))].filter(
          p => !blocked.has(p.author_id),
        ),
      );
    } catch (err) {
      showAlert('Error', (err as Error)?.message ?? 'Could not load this channel.');
    } finally {
      setLoading(false);
    }
  }, [channelId, userId, isPaidUser, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const shelves = useMemo(() => groupIntoShelves(posts), [posts]);
  const awaitingReview = useMemo(
    () => posts.filter(p => p.status === 'pending' || p.status === 'draft'),
    [posts],
  );

  return {
    channel,
    shelves,
    awaitingReview,
    isMember,
    loading,
    reload: load,
    markJoined: () => setIsMember(true),
  };
}
