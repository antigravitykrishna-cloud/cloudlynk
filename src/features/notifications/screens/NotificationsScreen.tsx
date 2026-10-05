import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { NotificationCard } from '@/features/notifications/components/NotificationCard';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import type { Notification } from '@/features/notifications/model';

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { notifications, unreadCount, loading, refresh, markAsRead, markAllAsRead } =
    useNotifications(user?.id);
  const refreshControl = usePullToRefresh(refresh);

  /** Marks it read and goes where it points: the plans for a billing notice, else its channel. */
  async function open(notification: Notification) {
    if (!notification.read) await markAsRead(notification.id);
    if (
      notification.type === 'subscription_expired' ||
      notification.type === 'subscription_expiring'
    ) {
      router.push('/premium');
    } else if (notification.channel_id) {
      router.push({
        pathname: '/(tabs)/channels/[id]',
        params: { id: notification.channel_id },
      });
    }
  }

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScreenHeader
        title="Notifications"
        right={
          unreadCount > 0 ? <TextButton label="Mark all read" onPress={markAllAsRead} /> : null
        }
      />

      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} style={styles.spinner} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {notifications.length === 0 ? (
            <EmptyState
              icon="bell"
              title="All caught up"
              message="You'll be notified here when your channels and posts are reviewed."
            />
          ) : (
            <>
              {unreadCount > 0 ? <Text style={styles.unread}>{unreadCount} UNREAD</Text> : null}
              {notifications.map(notification => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onPress={() => open(notification)}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: 60 },
  content: { flexGrow: 1, paddingBottom: Spacing.xxxl },
  unread: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
