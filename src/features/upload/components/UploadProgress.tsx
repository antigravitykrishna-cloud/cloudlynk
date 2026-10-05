import { StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import type { QueueItemStatus } from '@/features/upload/uploadQueue';

const LABELS: Record<QueueItemStatus, string> = {
  queued: 'Queued',
  uploading: '',
  done: '✓ Done',
  failed: '✕ Failed',
  over_limit: 'Too large',
};

/** A progress bar with the status written across it. */
export function UploadProgress({
  progress,
  status,
}: {
  progress: number;
  status: QueueItemStatus;
}) {
  const percent = Math.round(progress * 100);
  const color =
    status === 'done' ? Colors.success : status === 'failed' ? Colors.danger : Colors.brandBlue;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: color }]} />
      <Text style={styles.label}>{status === 'uploading' ? `${percent}%` : LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 24,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xs,
    overflow: 'hidden',
    marginTop: Spacing.sm,
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    textAlign: 'center',
  },
});
