import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ChannelService } from '@/lib/data/channels';
import type { Tables } from '@/lib/database.types';

/** The channels this user owns, reloaded whenever the screen gains focus. */
export function useMyChannels(userId: string | undefined) {
  const [channels, setChannels] = useState<Tables<'channels'>[]>([]);
  const [loading, setLoading] = useState(true);

  // A different account signed in: drop the previous account's channels at once.
  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
      setChannels([]);
      setLoading(true);
    }
    prevUserIdRef.current = userId;
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await ChannelService.getMyOwnedChannels(userId);
      setChannels(data ?? []);
    } catch (err) {
      if (__DEV__) console.error('loadMyChannels:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  return { channels, loading };
}
