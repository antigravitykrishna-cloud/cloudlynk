import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/components/ui/Chip';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import {
  PendingChannelCard,
  PendingLegacyVideoCard,
  PendingPostCard,
} from '@/features/admin/components/PendingItems';
import { useReviewQueue } from '@/features/admin/hooks/useReviewQueue';

// The whole review queue on one page: new channels, legacy channel videos, and new posts.

export default function PendingChannelsScreen() {
  const queue = useReviewQueue({ legacyVideos: true });
  const refreshControl = usePullToRefresh(queue.reload);

  return (
    <AdminScreen title="Admin Queue">
      {queue.loading ? (
        <ActivityIndicator color={Colors.brandBlue} size="large" style={styles.loading} />
      ) : (
        <ScrollView contentContainerStyle={adminStyles.list} refreshControl={refreshControl}>
          <QueueSection title="Pending Channels" count={queue.channels.length}>
            {queue.channels.map(channel => (
              <PendingChannelCard key={channel.id} channel={channel} queue={queue} />
            ))}
          </QueueSection>
          <QueueSection title="Pending Videos" count={queue.videos.length}>
            {queue.videos.map(video => (
              <PendingLegacyVideoCard key={video.id} video={video} queue={queue} />
            ))}
          </QueueSection>
          <QueueSection title="Pending Posts" count={queue.posts.length}>
            {queue.posts.map(post => (
              <PendingPostCard key={post.id} post={post} queue={queue} />
            ))}
          </QueueSection>
        </ScrollView>
      )}
    </AdminScreen>
  );
}

function QueueSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={adminStyles.row}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {count > 0 ? <Chip label={String(count)} tone="warn" /> : null}
      </View>
      {count === 0 ? <Text style={styles.empty}>Nothing waiting.</Text> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 60 },
  section: { marginBottom: Spacing.xl },
  sectionTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
  },
  empty: { color: Colors.textMuted, fontSize: FontSize.md, marginBottom: Spacing.sm },
});
