import { useState, useEffect, useCallback, useRef } from 'react';
import { NotificationService, Notification } from '../lib/notifications';
import { supabase } from '../lib/supabase';

// ── Shared unread-count across all hook instances ────────────────
// The home-tab badge and the Notifications screen mount this hook separately,
// each with its own useState. Marking notifications read in the screen must also
// update the badge — so the unread COUNT lives at module scope and every instance
// mirrors it. (The list stays per-instance; only the screen renders it.)
let sharedUnread = 0;
const unreadListeners = new Set<(n: number) => void>();
function setSharedUnread(n: number) {
  sharedUnread = Math.max(0, n);
  unreadListeners.forEach((l) => l(sharedUnread));
}

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(sharedUnread);
  const [loading, setLoading] = useState(true);
  // Stable unique id per hook instance. Two mounted consumers (the home-screen
  // badge and the Notifications screen) must NOT share a realtime channel name:
  // supabase-js returns the existing already-subscribed channel for a duplicate
  // name, and the second `.on('postgres_changes', …)` then throws
  // "cannot add postgres_changes callbacks after subscribe()" → screen crash.
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  // Mirror the module-level shared unread count into this instance, so the home
  // badge and the Notifications screen always show the same number.
  useEffect(() => {
    const listener = (n: number) => setUnreadCount(n);
    unreadListeners.add(listener);
    setUnreadCount(sharedUnread);
    return () => { unreadListeners.delete(listener); };
  }, []);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    try {
      const [all, count] = await Promise.all([
        NotificationService.getAll(userId),
        NotificationService.getUnreadCount(userId),
      ]);
      setNotifications(all);
      setSharedUnread(count);
    } catch {
      // Silently fail — notifications are non-critical
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Initial load + Supabase Realtime subscription (replaces 30s polling)
  useEffect(() => {
    if (!userId) return;
    fetchAll();

    // Subscribe to INSERT events on the user's own notification rows only.
    // Supabase Realtime delivers new rows within ~100ms — no polling needed.
    const channel = supabase
      .channel(`notifications:${userId}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // A new notification arrived — re-fetch the full list to stay consistent
          fetchAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchAll, instanceId]);

  const markAsRead = useCallback(async (id: string) => {
    await NotificationService.markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setSharedUnread(sharedUnread - 1);
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    await NotificationService.markAllAsRead(userId);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setSharedUnread(0);
  }, [userId]);

  return {
    notifications,
    unreadCount,
    loading,
    refresh: fetchAll,
    markAsRead,
    markAllAsRead,
  };
}
