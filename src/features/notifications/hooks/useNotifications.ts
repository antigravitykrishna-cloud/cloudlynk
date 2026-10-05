import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi } from '@/features/notifications/api/notificationsApi';
import type { Notification } from '@/features/notifications/model';

// The unread count is shared by every caller (the profile badge and the Notifications screen are
// mounted separately), so marking one read in the screen also updates the badge. The list itself
// is per caller; only the screen shows it.
let sharedUnread = 0;
const unreadListeners = new Set<(count: number) => void>();

function setSharedUnread(count: number) {
  sharedUnread = Math.max(0, count);
  unreadListeners.forEach(listener => listener(sharedUnread));
}

/** The person's notifications, kept current through Realtime, and marking them read. */
export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(sharedUnread);
  const [loading, setLoading] = useState(true);
  const listenerId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    unreadListeners.add(setUnreadCount);
    setUnreadCount(sharedUnread);
    return () => {
      unreadListeners.delete(setUnreadCount);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [list, unread] = await Promise.all([
        notificationsApi.list(userId),
        notificationsApi.countUnread(userId),
      ]);
      setNotifications(list);
      setSharedUnread(unread);
    } catch {
      // Not worth interrupting anyone for; the next arrival or pull-to-refresh tries again.
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    return notificationsApi.subscribeToNew(userId, listenerId, refresh);
  }, [userId, listenerId, refresh]);

  const markAsRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id);
    setNotifications(current => current.map(n => (n.id === id ? { ...n, read: true } : n)));
    setSharedUnread(sharedUnread - 1);
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    await notificationsApi.markAllRead(userId);
    setNotifications(current => current.map(n => ({ ...n, read: true })));
    setSharedUnread(0);
  }, [userId]);

  return { notifications, unreadCount, loading, refresh, markAsRead, markAllAsRead };
}
