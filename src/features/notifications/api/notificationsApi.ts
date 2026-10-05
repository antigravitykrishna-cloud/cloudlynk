import { supabase } from '@/lib/supabase';
import type { Notification, NotificationType } from '@/features/notifications/model';

const LIST_LIMIT = 50;

export const notificationsApi = {
  async list(userId: string): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (error) throw error;
    return (data ?? []) as Notification[];
  },

  async countUnread(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) throw error;
    return count ?? 0;
  },

  async markRead(notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
    if (error) throw error;
  },

  async markAllRead(userId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) throw error;
  },

  /**
   * Calls `onNew` within moments of a notification arriving for `userId` (Supabase Realtime).
   * `listenerId` must be unique per caller: a second subscription under the same channel name
   * reuses the first, already-subscribed channel, and adding a listener to it throws.
   */
  subscribeToNew(userId: string, listenerId: string, onNew: () => void): () => void {
    const channel = supabase
      .channel(`notifications:${userId}:${listenerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        onNew,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  /** Sends a notification to someone. Admin-only (the insert policy checks). */
  async send(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    links: { channelId?: string; postId?: string } = {},
  ): Promise<void> {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      body,
      channel_id: links.channelId ?? null,
      post_id: links.postId ?? null,
      read: false,
    });
    if (error) throw error;
  },
};

/** The messages an admin's review decisions send to the uploader. */
export const reviewNotifications = {
  channelApproved: (ownerId: string, channelName: string, channelId: string) =>
    notificationsApi.send(
      ownerId,
      'channel_approved',
      'Channel approved 🎉',
      `Your channel "${channelName}" is now live and visible to everyone.`,
      { channelId },
    ),

  channelRejected: (ownerId: string, channelName: string, channelId: string) =>
    notificationsApi.send(
      ownerId,
      'channel_rejected',
      'Channel not approved',
      `Your channel "${channelName}" did not meet our content guidelines. You can edit and resubmit.`,
      { channelId },
    ),

  postApproved: (authorId: string, channelName: string, channelId: string, postId: string) =>
    notificationsApi.send(
      authorId,
      'post_approved',
      'Post approved ✓',
      `Your post in "${channelName}" is now live.`,
      { channelId, postId },
    ),

  postRejected: (authorId: string, channelName: string, channelId: string, postId: string) =>
    notificationsApi.send(
      authorId,
      'post_rejected',
      'Post not approved',
      `Your post in "${channelName}" was not approved. Check the rejection note for details.`,
      { channelId, postId },
    ),
};
