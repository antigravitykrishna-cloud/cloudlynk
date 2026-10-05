// In-app notifications: rows in `notifications`, written by admins (reviews, announcements) and by
// the scheduled plan-expiry jobs in the database.

export type NotificationType =
  | 'channel_approved'
  | 'channel_rejected'
  | 'post_approved'
  | 'post_rejected'
  /** Written by the database's plan-expiry jobs, never by the app. */
  | 'subscription_expiring'
  | 'subscription_expired'
  /** Sent from Admin -> Announcement. */
  | 'announcement';

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
