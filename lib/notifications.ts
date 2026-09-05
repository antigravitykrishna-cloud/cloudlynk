import { supabase } from './supabase';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type NotificationType =
  | 'channel_approved'
  | 'channel_rejected'
  | 'post_approved'
  | 'post_rejected';

export type Notification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  channel_id: string | null;
  post_id: string | null;
  read: boolean;
  created_at: string;
};

// Icon + color per notification type
export const NOTIF_META: Record<NotificationType, { icon: string; color: string; dimColor: string }> = {
  channel_approved: { icon: '✅', color: '#3fb950', dimColor: 'rgba(63,185,80,0.12)' },
  channel_rejected: { icon: '❌', color: '#f85149', dimColor: 'rgba(248,81,73,0.12)'  },
  post_approved:    { icon: '✓',  color: '#00d4aa', dimColor: 'rgba(0,212,170,0.12)' },
  post_rejected:    { icon: '✕',  color: '#f85149', dimColor: 'rgba(248,81,73,0.12)'  },
};

export const NotificationService = {
  // ── Read ─────────────────────────────────────────────────────

  async getAll(userId: string): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as Notification[];
  },

  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) throw error;
    return count ?? 0;
  },

  // ── Update ───────────────────────────────────────────────────

  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
    if (error) throw error;
  },

  async markAllAsRead(userId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) throw error;
  },

  // ── Create (called by admin panel only) ──────────────────────

  async send(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    channelId?: string,
    postId?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        body,
        channel_id: channelId ?? null,
        post_id: postId ?? null,
        read: false,
      });
    if (error) throw error;
  },

  // ── Push Notifications ───────────────────────────────────────
  
  async registerForPushNotificationsAsync(): Promise<string | null> {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E50914',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        return null;
      }
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      // We wrap in try catch in case projectId is missing or network error
      try {
        const pushTokenString = (await Notifications.getExpoPushTokenAsync({
          projectId,
        })).data;
        return pushTokenString;
      } catch (e: any) {
        if (__DEV__) console.warn('Failed to get push token:', e.message);
        return null;
      }
    } else {
      if (__DEV__) console.log('Must use physical device for Push Notifications');
      return null;
    }
  },

  async syncPushToken(userId: string): Promise<void> {
    try {
      const token = await this.registerForPushNotificationsAsync();
      if (token) {
        await supabase.from('profiles').update({ fcm_token: token }).eq('id', userId);
      }
    } catch (e) {
      if (__DEV__) console.warn('Failed to sync push token', e);
    }
  },

  // ── Convenience senders ──────────────────────────────────────

  async channelApproved(ownerId: string, channelName: string, channelId: string) {
    return NotificationService.send(
      ownerId,
      'channel_approved',
      'Channel approved 🎉',
      `Your channel "${channelName}" is now live and visible to everyone.`,
      channelId
    );
  },

  async channelRejected(ownerId: string, channelName: string, channelId: string) {
    return NotificationService.send(
      ownerId,
      'channel_rejected',
      'Channel not approved',
      `Your channel "${channelName}" did not meet our content guidelines. You can edit and resubmit.`,
      channelId
    );
  },

  async postApproved(authorId: string, channelName: string, channelId: string, postId: string) {
    return NotificationService.send(
      authorId,
      'post_approved',
      'Post approved ✓',
      `Your post in "${channelName}" is now live.`,
      channelId,
      postId
    );
  },

  async postRejected(authorId: string, channelName: string, channelId: string, postId: string) {
    return NotificationService.send(
      authorId,
      'post_rejected',
      'Post not approved',
      `Your post in "${channelName}" was not approved. Check the rejection note for details.`,
      channelId,
      postId
    );
  },
};
