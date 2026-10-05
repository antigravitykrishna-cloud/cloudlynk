import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { formatBytes } from '@/utils/format';
import { STREAM_MAX_MB } from '@/features/upload/api/streamUploadApi';
import type { QueueItem, QueueItemStatus } from '@/features/upload/uploadQueue';

const STATUS: Record<QueueItemStatus, { label: string; tone: ChipTone }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  uploading: { label: 'Uploading', tone: 'brand' },
  done: { label: 'Done', tone: 'good' },
  failed: { label: 'Failed', tone: 'bad' },
  over_limit: { label: 'Too large', tone: 'bad' },
};

/** One video in the upload queue: name, size, status, and what can be done with it now. */
export function QueueItemCard({
  item,
  onEdit,
  onRetry,
  onRemove,
}: {
  item: QueueItem;
  onEdit: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const status =
    item.status === 'uploading'
      ? { label: `${Math.round(item.progress * 100)}%`, tone: 'brand' as const }
      : STATUS[item.status];
  const problem =
    item.status === 'over_limit'
      ? `This file is ${formatBytes(item.video.size)} — the limit is ${STREAM_MAX_MB} MB. Pick a smaller file.`
      : item.status === 'failed'
        ? item.error
        : null;

  return (
    <Card style={styles.card}>
      {item.status === 'uploading' ? (
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${Math.round(item.progress * 100)}%` }]} />
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {item.title || item.video.name}
          </Text>
          <Text style={styles.size}>{formatBytes(item.video.size)}</Text>
        </View>
        <Chip label={status.label} tone={status.tone} />
      </View>

      {problem ? (
        <Text style={styles.problem} numberOfLines={2}>
          {problem}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {item.status === 'queued' || item.status === 'over_limit' ? (
          <Button label="Edit" variant="secondary" size="sm" onPress={onEdit} />
        ) : null}
        {item.status === 'failed' ? (
          <Button label="Retry" variant="success" size="sm" onPress={onRetry} />
        ) : null}
        {item.status !== 'uploading' ? (
          <Button label="Remove" variant="danger" size="sm" onPress={onRemove} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  progress: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.surface,
  },
  progressFill: { height: 3, backgroundColor: Colors.brandBlue, borderRadius: Radius.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  size: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  problem: { fontSize: FontSize.sm, color: Colors.danger, marginTop: Spacing.sm },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
});
