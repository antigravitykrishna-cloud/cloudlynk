import { useEffect } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { registerForPushNotifications } from '@/features/notifications/pushRegistration';

/** Registers this device for push notifications once signed in, unless the person turned them off. */
export function usePushRegistration() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const enabled = profile?.notifications_enabled !== false;

  useEffect(() => {
    if (userId && enabled) registerForPushNotifications(userId);
  }, [userId, enabled]);
}
