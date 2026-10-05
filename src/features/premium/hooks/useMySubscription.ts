import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { subscriptionApi, type SubscriptionStatus } from '@/features/premium/api/subscriptionApi';

/** The signed-in person's subscription, reloaded each time the screen comes into focus. */
export function useMySubscription() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      subscriptionApi
        .getMine()
        .then(setStatus)
        .catch(err => __DEV__ && console.error('useMySubscription:', err))
        .finally(() => setLoading(false));
    }, []),
  );

  return { status, loading };
}
