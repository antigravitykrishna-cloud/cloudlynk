import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useOnAccountChange } from '@/features/auth/hooks/useOnAccountChange';
import { channelsApi, type Channel, type DiscoverSort } from '@/features/channels/api/channelsApi';

/** Discover lists every public channel; Joined lists the person's own. */
export type ChannelListTab = 'discover' | 'feed' | 'joined';

/**
 * The Channels tab's list and which channels the person has joined. Reloads whenever the tab comes
 * into focus, so joining from a channel page shows up on return.
 */
export function useChannelList(tab: ChannelListTab, sort: DiscoverSort) {
  const { user } = useAuth();
  const userId = user?.id;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // An empty list and a failed request are different facts; only one is worth retrying.
  const [loadFailed, setLoadFailed] = useState(false);

  useOnAccountChange(() => {
    setChannels([]);
    setJoinedIds(new Set());
    setLoading(true);
  });

  const loadChannels = useCallback(async () => {
    try {
      if (tab === 'joined') {
        setChannels(userId ? await channelsApi.listJoined(userId) : []);
      } else {
        // "Feed" has no list of its own yet and shows Discover. Discover works signed out.
        setChannels(await channelsApi.listDiscover(sort));
      }
      setLoadFailed(false);
    } catch (err) {
      if (__DEV__) console.error('loadChannels error:', err);
      // Keep what is on screen: a failed refresh should say so, not blank a working list.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tab, sort, userId]);

  const loadJoinedIds = useCallback(async () => {
    // Cleared rather than skipped when signed out, so no previous account's joins linger.
    setJoinedIds(
      userId ? await channelsApi.listJoinedIds(userId).catch(() => new Set<string>()) : new Set(),
    );
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadChannels();
      loadJoinedIds();
    }, [loadChannels, loadJoinedIds]),
  );

  const reload = useCallback(async () => {
    await Promise.all([loadChannels(), loadJoinedIds()]);
  }, [loadChannels, loadJoinedIds]);

  return { channels, joinedIds, loading, loadFailed, reload, refresh: loadChannels };
}
