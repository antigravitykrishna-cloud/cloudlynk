import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { Notification, NOTIF_META } from '../lib/notifications';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { formatTimeAgo } from '../lib/storage';
import { Icon } from '../components/Icon';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useNotifications(user?.id);

  const handleTap = useCallback(async (notif: Notification) => {
    if (!notif.read) await markAsRead(notif.id);

    // Billing notifications (v75) carry no channel_id, so the branch below
    // never fired for them: "Your subscription has ended -- renew any time to
    // unlock full content again" marked itself read and went nowhere. That is
    // the one notification with a clear next step, and it was the only one
    // with no destination. Send it where it is telling the user to go.
    if (notif.type === 'subscription_expired' || notif.type === 'subscription_expiring') {
      router.push('/premium');
      return;
    }

    if (notif.channel_id) {
      router.push({ pathname: '/(tabs)/channels/[id]', params: { id: notif.channel_id } });
    }
  }, [markAsRead, router]);

  const NotifCard = ({ notif }: { notif: Notification }) => {
    // Fall back to a neutral style for any unknown/legacy/null notification type
    // so a single bad row can't crash the whole screen (undefined meta access).
    const meta = NOTIF_META[notif.type] ?? { icon: 'bell' as const, color: Colors.textMuted, dimColor: 'rgba(255,255,255,0.06)' };
    return (
      <TouchableOpacity
        style={[styles.card, !notif.read && styles.cardUnread]}
        onPress={() => handleTap(notif)}
        activeOpacity={0.75}
      >
        {/* Unread dot */}
        {!notif.read && <View style={[styles.unreadDot, { backgroundColor: meta.color }]} />}

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: meta.dimColor }]}>
          <Icon name={meta.icon} size={19} color={meta.color} />
        </View>

        {/* Content */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, !notif.read && { color: Colors.text }]}>
            {notif.title}
          </Text>
          <Text style={styles.body} numberOfLines={2}>{notif.body}</Text>
          <Text style={styles.time}>{formatTimeAgo(notif.created_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllAsRead}>
            <Text style={styles.markAllBtn}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refresh} tintColor={Colors.accent} />
          }
        >
          {notifications.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="bell" size={44} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>All caught up</Text>
              <Text style={styles.emptyDesc}>
                You'll be notified here when your channels and posts are reviewed.
              </Text>
            </View>
          ) : (
            <>
              {unreadCount > 0 && (
                <Text style={styles.sectionLabel}>
                  {unreadCount} UNREAD
                </Text>
              )}
              {notifications.map(n => <NotifCard key={n.id} notif={n} />)}
            </>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { fontSize: 26, color: Colors.accent, fontWeight: FontWeight.bold },
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.extrabold, color: Colors.text, textAlign: 'center' },
  markAllBtn: { fontSize: FontSize.sm, color: Colors.accent, fontWeight: FontWeight.bold, width: 80, textAlign: 'right' },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.8, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, borderBottomWidth: 0.5, borderBottomColor: Colors.border, position: 'relative' },
  cardUnread: { backgroundColor: 'rgba(255,255,255,0.025)' },
  unreadDot: { position: 'absolute', left: 6, top: '50%', width: 6, height: 6, borderRadius: 3 },
  iconWrap: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginBottom: 3 },
  body: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold, lineHeight: 18, marginBottom: 4 },
  time: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: Spacing.xxxl },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
