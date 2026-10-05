import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, TextButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { pickVideoFiles } from '@/lib/mediaPicker';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { STREAM_MAX_BYTES, STREAM_MAX_MB } from '@/features/upload/api/streamUploadApi';
import { QueueItemCard } from '@/features/upload/components/QueueItemCard';
import { useUploadQueue, type QueueItem } from '@/features/upload/hooks/useUploadQueue';
import { errorMessage } from '@/utils/errors';

// Every video waiting to upload, with start / pause and per-item edit, retry and remove. The queue
// is kept on the device, so it survives closing the app.

export default function UploadQueueScreen() {
  const router = useRouter();
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const queue = useUploadQueue(channelId);
  const [adding, setAdding] = useState(false);
  const limitLabel = queue.maxItems === Infinity ? '∞' : String(queue.maxItems);

  async function addVideos() {
    setAdding(true);
    try {
      const videos = await pickVideoFiles({ multiple: true });
      if (videos.length === 0) return;

      const tooLarge = videos.filter(video => video.size > STREAM_MAX_BYTES);
      if (tooLarge.length > 0) {
        showAlert(
          'Files too large',
          `${tooLarge.length} file(s) exceed the ${STREAM_MAX_MB}MB upload limit and will be skipped.`,
        );
      }

      const added = await queue.add(videos.map(video => ({ video })));
      if (added.length === 0) {
        // The limit is how many files fit in one batch. Storage is 15 GB on every plan, Premium
        // included, so "unlimited uploads" would be a false claim.
        showAlert(
          'Queue full',
          `You can queue ${queue.maxItems} files at a time. Remove some, or go Premium to queue as many as you like — storage stays 15 GB on every plan.`,
        );
      }
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not add videos'));
    } finally {
      setAdding(false);
    }
  }

  const confirmRemove = (item: QueueItem) =>
    showAlert('Remove', `Remove "${item.title || item.video.name}" from the queue?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => queue.remove(item.id) },
    ]);

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScreenHeader
        title="Upload Queue"
        right={
          adding ? (
            <ActivityIndicator color={Colors.brandBlue} size="small" />
          ) : (
            <TextButton label="+ Add" onPress={addVideos} />
          )
        }
      />

      <View style={styles.stats}>
        <Stat value={queue.queuedCount} label="Queued" />
        <Stat value={queue.completedCount} label="Done" />
        <Stat value={queue.failedCount} label="Failed" alarming={queue.failedCount > 0} />
        <Stat value={limitLabel} label="Limit" />
      </View>

      {queue.items.length > 0 && (
        <View style={styles.controls}>
          {queue.isUploading ? (
            <Button label="⏸ Pause" variant="secondary" onPress={queue.pause} style={styles.grow} />
          ) : (
            <Button
              label={queue.queuedCount > 0 ? '▶ Start Upload' : 'No queued items'}
              onPress={queue.start}
              disabled={queue.queuedCount === 0}
              style={styles.grow}
            />
          )}
          {queue.completedCount > 0 || queue.failedCount > 0 ? (
            <Button label="Clear done" variant="secondary" onPress={queue.clearFinished} />
          ) : null}
        </View>
      )}

      {queue.isUploading && (
        <View style={styles.banner}>
          <ActivityIndicator color={Colors.brandBlue} size="small" />
          <Text style={styles.bannerText}>
            Uploading {queue.completedCount + 1} of {queue.items.length}…
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {queue.items.length === 0 ? (
          <EmptyState
            icon="folder"
            title="No uploads queued"
            message={`Tap "+ Add" to pick videos from your device. You can queue ${
              queue.maxItems === Infinity ? 'as many files as you like' : `${queue.maxItems} files`
            } at once.`}
            action={{ label: 'Pick Videos', onPress: addVideos }}
          />
        ) : (
          queue.items.map(item => (
            <QueueItemCard
              key={item.id}
              item={item}
              onEdit={() => router.push({ pathname: '/upload/form/[id]', params: { id: item.id } })}
              onRetry={() => queue.retry(item.id)}
              onRemove={() => confirmRemove(item)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  value,
  label,
  alarming = false,
}: {
  value: number | string;
  label: string;
  alarming?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, alarming && styles.statAlarming]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  stats: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.text },
  statAlarming: { color: Colors.danger },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  controls: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg },
  grow: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.brandBlueDim,
  },
  bannerText: { color: Colors.brandBlue, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  list: { padding: Spacing.lg, paddingBottom: 60 },
});
