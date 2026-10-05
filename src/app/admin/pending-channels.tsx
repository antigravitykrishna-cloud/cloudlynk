import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { QueueRow, QueueSection } from '@/components/admin/QueueSection';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { usePendingQueue } from '@/hooks/usePendingQueue';
import { formatFileSize, formatDuration } from '@/lib/data/channelVideos';

const day = (iso: string) => new Date(iso).toLocaleDateString();

export default function PendingChannelsScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { queue, loading, refreshing, refresh, channel, video, post } = usePendingQueue(isAdmin);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.replace('/(tabs)/profile')}
        style={styles.headerBack}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={styles.headerBackTxt}>{'‹'}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Admin Queue</Text>
      <View style={{ width: 32 }} />
    </View>
  );

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Access denied</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header}

      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} size="large" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={Colors.brandBlue}
            />
          }
        >
          <QueueSection
            first
            title="Pending Channels"
            count={queue.channels.length}
            emptyText="No pending channels"
          >
            {queue.channels.map(c => (
              <QueueRow
                key={c.id}
                name={c.name}
                meta={[`${c.owner_email ?? 'Unknown'} · ${day(c.created_at)}`]}
                description={c.description}
                actions={[
                  { kind: 'approve', onPress: () => channel.approve(c) },
                  { kind: 'reject', onPress: () => channel.reject(c) },
                ]}
              />
            ))}
          </QueueSection>

          <QueueSection
            title="Pending Videos"
            count={queue.videos.length}
            emptyText="No pending videos"
          >
            {queue.videos.map(v => (
              <QueueRow
                key={v.id}
                name={v.title ?? 'Untitled video'}
                meta={[
                  `${v.channel_name ?? 'Unknown channel'} · ${v.owner_email ?? 'Unknown'}`,
                  `${formatFileSize(v.file_size_bytes ?? 0)} · ${formatDuration(v.duration_seconds)} · ${day(v.created_at)}`,
                ]}
                actions={[
                  { kind: 'play', onPress: () => video.play(v) },
                  { kind: 'approve', onPress: () => video.approve(v) },
                  { kind: 'reject', onPress: () => video.reject(v) },
                ]}
              />
            ))}
          </QueueSection>

          <QueueSection
            title="Pending Channel Posts"
            count={queue.posts.length}
            emptyText="No pending channel posts"
          >
            {queue.posts.map(p => (
              <QueueRow
                key={p.id}
                name={p.title ?? 'Untitled'}
                badge={p.content_type?.toUpperCase()}
                meta={[
                  `${p.channel_name ?? 'Unknown channel'} · ${p.author_email ?? 'Unknown'}`,
                  day(p.created_at),
                ]}
                actions={[
                  ...(p.video_url ? [{ kind: 'play' as const, onPress: () => post.play(p) }] : []),
                  { kind: 'approve', onPress: () => post.approve(p) },
                  { kind: 'reject', onPress: () => post.reject(p) },
                ]}
              />
            ))}
          </QueueSection>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { color: '#ffffff', fontSize: 28, fontWeight: '700', lineHeight: 28 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  list: { paddingVertical: 8 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
  },
  emptyText: { fontSize: 16, color: Colors.text, fontWeight: '600' },
});
