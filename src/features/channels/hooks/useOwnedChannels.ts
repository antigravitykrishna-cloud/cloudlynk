import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useOnAccountChange } from '@/features/auth/hooks/useOnAccountChange';
import { channelsApi, type Channel } from '@/features/channels/api/channelsApi';

/** The channels this person owns, newest first, reloaded whenever the screen comes into focus. */
export function useOwnedChannels(userId: string | undefined) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useOnAccountChange(() => {
    setChannels([]);
    setLoading(true);
  });

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      setLoading(true);
      channelsApi
        .listOwned(userId)
        .then(setChannels)
        .catch(err => __DEV__ && console.error('useOwnedChannels:', err))
        .finally(() => setLoading(false));
    }, [userId]),
  );

  return { channels, loading };
}
