/**
 * Notification Manager
 * Handles push notifications for subscription expiry, new content, promos
 * Uses expo-notifications for cross-platform support
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type NotificationType = 'subscription_expiry' | 'new_content' | 'promo' | 'admin_message';

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  scheduledFor?: Date;
}

export interface StoredNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, string>;
}

export class NotificationManager {
  private static readonly PUSH_TOKEN_KEY = 'push_token';
  private static isInitialized = false;

  /**
   * Initialize notification system
   * Call once at app startup
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Set up notification handler
      Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
          // Handle notification while app is in foreground
          console.log('Notification received:', notification);
          return {
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
          };
        },
      });

      // Get and store push token
      await this.updatePushToken();

      // Listen to notification responses
      this.setupNotificationListeners();

      this.isInitialized = true;
    } catch (error) {
      console.error('Notification initialization failed:', error);
    }
  }

  /**
   * Get or create push token
   */
  private static async updatePushToken(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        console.warn('Push notifications require a physical device');
        return null;
      }

      // Request permissions
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Notification permission denied');
        return null;
      }

      // Get token
      const projectId = Constants.expoConfig?.extra?.projectId || Constants.projectId;
      const token = await Notifications.getExpoPushTokenAsync({ projectId });

      // Cache token
      await SecureStore.setItemAsync(this.PUSH_TOKEN_KEY, token.data);

      return token.data;
    } catch (error) {
      console.error('Failed to get push token:', error);
      return null;
    }
  }

  /**
   * Send notification (local or remote)
   */
  static async sendNotification(payload: NotificationPayload): Promise<void> {
    try {
      if (payload.scheduledFor) {
        // Schedule for later
        await Notifications.scheduleNotificationAsync({
          content: {
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
            badge: 1,
            sound: Platform.OS === 'android' ? 'default' : undefined,
          },
          trigger: {
            seconds: Math.ceil(
              (payload.scheduledFor.getTime() - Date.now()) / 1000
            ),
          } as any,
        });
      } else {
        // Send immediately
        await Notifications.scheduleNotificationAsync({
          content: {
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
            badge: 1,
            sound: Platform.OS === 'android' ? 'default' : undefined,
          },
          trigger: null, // Immediate
        });
      }

      // Store notification
      await this.storeNotification(payload);
    } catch (error) {
      console.error('Send notification failed:', error);
    }
  }

  /**
   * Store notification in Supabase for persistence
   */
  private static async storeNotification(payload: NotificationPayload): Promise<void> {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data?.user?.id) return;

      const insertData: Record<string, any> = {
        user_id: user.data.user.id,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        read: false,
        created_at: new Date().toISOString(),
      };

      // Only add data field if the column exists in the schema
      if (payload.data) {
        (insertData as any).data = payload.data;
      }

      await supabase
        .from('notifications')
        .insert(insertData as any);
    } catch (error) {
      console.warn('Store notification failed (notifications table may not be fully configured):', error);
    }
  }

  /**
   * Get all notifications for current user
   */
  static async getNotifications(): Promise<StoredNotification[]> {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data?.user?.id) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.data.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (
        data?.map((n) => ({
          id: n.id,
          type: (n.type || 'admin_message') as NotificationType,
          title: n.title,
          body: n.body,
          read: n.read || false,
          createdAt: n.created_at,
          data: (n as any).data,
        })) || []
      );
    } catch (error) {
      console.error('Get notifications failed:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Mark as read failed:', error);
    }
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount(): Promise<number> {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data?.user?.id) return 0;

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.data.user.id)
        .eq('read', false);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Get unread count failed:', error);
      return 0;
    }
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(): Promise<void> {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data?.user?.id) return;

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.data.user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Mark all as read failed:', error);
    }
  }

  /**
   * Delete notification
   */
  static async deleteNotification(notificationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Delete notification failed:', error);
    }
  }

  /**
   * Setup listeners for notification responses
   */
  private static setupNotificationListeners(): void {
    // Notification received while app in foreground
    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received:', notification);
      }
    );

    // Notification tapped by user
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const { data } = response.notification.request.content;
        console.log('Notification tapped:', data);

        // Handle action based on notification type
        if (data?.action) {
          // Navigate to relevant screen based on action
          // This would integrate with your router/navigation
        }
      }
    );
  }

  /**
   * Cleanup listeners
   */
  static cleanup(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
    }
    if (this.responseListener) {
      this.responseListener.remove();
    }
  }

  private static notificationListener: Notifications.Subscription;
  private static responseListener: Notifications.Subscription;
}
