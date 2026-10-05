import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing, withAlpha } from '@/theme';
import { formatTimeAgo } from '@/utils/format';
import type { Notification, NotificationType } from '@/features/notifications/model';

const STYLE: Record<NotificationType, { icon: IconName; color: string; tint: string }> = {
  channel_approved: { icon: 'check-circle', color: Colors.success, tint: Colors.successDim },
  channel_rejected: { icon: 'flag', color: Colors.danger, tint: Colors.dangerDim },
  post_approved: { icon: 'check-circle', color: Colors.success, tint: Colors.successDim },
  post_rejected: { icon: 'flag', color: Colors.danger, tint: Colors.dangerDim },
  // Amber, not red: the plan still works when this one arrives.
  subscription_expiring: { icon: 'diamond', color: Colors.warning, tint: Colors.warningDim },
  subscription_expired: { icon: 'lock', color: Colors.danger, tint: Colors.dangerDim },
  announcement: { icon: 'bell', color: Colors.brandBlue, tint: Colors.brandBlueDim },
};

/** An unknown type (an older or newer row) gets a neutral look rather than breaking the list. */
const FALLBACK = {
  icon: 'bell' as const,
  color: Colors.textMuted,
  tint: withAlpha(Colors.white, 0.06),
};

export function NotificationCard({
  notification,
  onPress,
}: {
  notification: Notification;
  onPress: () => void;
}) {
  const style = STYLE[notification.type] ?? FALLBACK;
  const unread = !notification.read;
  return (
    <TouchableOpacity
      style={[styles.card, unread && styles.unread]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {unread ? <View style={[styles.dot, { backgroundColor: style.color }]} /> : null}
      <View style={[styles.icon, { backgroundColor: style.tint }]}>
        <Icon name={style.icon} size={19} color={style.color} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, unread && styles.titleUnread]}>{notification.title}</Text>
        <Text style={styles.body} numberOfLines={2}>
          {notification.body}
        </Text>
        <Text style={styles.time}>{formatTimeAgo(notification.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  unread: { backgroundColor: withAlpha(Colors.white, 0.025) },
  dot: { position: 'absolute', left: 6, top: '50%', width: 6, height: 6, borderRadius: 3 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, minWidth: 0 },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: 3,
  },
  titleUnread: { color: Colors.text },
  body: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  time: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold },
});
