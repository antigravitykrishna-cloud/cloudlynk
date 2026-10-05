import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ChannelService } from '@/lib/data/channels';
import { supabase } from '@/lib/supabase';
import type { Channel, ChannelFilter, ChannelTab } from '@/components/channels/shared';

/** The Channels tab's list for the current tab and filter, plus which channels the user joined. */
export function useChannelList(userId: string | undefined, tab: ChannelTab, filter: ChannelFilter) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // An empty list and a failed request are different facts, and only one of
  // them is the user's to act on.
  const [loadFailed, setLoadFailed] = useState(false);

  // A different account signed in: drop the previous account's lists at once.
  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
      setChannels([]);
      setJoinedIds(new Set());
      setLoading(true);
    }
    prevUserIdRef.current = userId;
  }, [userId]);

  const loadMemberships = useCallback(async () => {
    // Cleared rather than left alone: signing out must not leave the previous
    // account's channels marked as joined.
    if (!userId) {
      setJoinedIds(new Set());
      return;
    }
    const { data } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', userId);
    setJoinedIds(new Set((data ?? []).map(r => r.channel_id)));
  }, [userId]);

  const loadChannels = useCallback(async () => {
    try {
      let data: Channel[];
      if (tab === 'joined') {
        data = userId ? ((await ChannelService.getMyChannels(userId)) as Channel[]) : [];
      } else {
        // Discover also works for guests (public, active channels are readable without an account).
        // The cast is needed because getDiscoverChannels selects named columns, a narrower type
        // than Channel; every field this list renders is included.
        data = (await ChannelService.getDiscoverChannels(
          userId ?? '',
          filter,
        )) as unknown as Channel[];
      }
      setChannels(data);
      setLoadFailed(false);
    } catch (err) {
      if (__DEV__) console.error('loadChannels error:', err);
      // Leave `channels` alone — a failed refresh should not blank a list
      // that was working, it should say the refresh failed.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId, tab, filter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadChannels();
      loadMemberships();
    }, [loadChannels, loadMemberships]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadChannels();
    setRefreshing(false);
  }, [loadChannels]);

  /** Reload after a join, leave or delete. */
  const reload = useCallback(async () => {
    await loadChannels();
    await loadMemberships();
  }, [loadChannels, loadMemberships]);

  return {
    channels,
    joinedIds,
    loading,
    refreshing,
    loadFailed,
    refresh,
    reload,
    reloadChannels: loadChannels,
  };
}
