import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius } from '@/constants/theme';
import type { QueueItem } from '@/lib/video/uploadQueue';
import { progressLabel } from '@/lib/video/uploadForm';

/** Per-video progress for the uploads started from this screen. */
export function UploadProgress({
  items,
  allDone,
  isUploading,
}: {
  items: QueueItem[];
  allDone: boolean;
  isUploading: boolean;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>
        {allDone ? '✓ All uploads complete' : isUploading ? 'Uploading…' : 'Queued'}
      </Text>
      {items.map((item, idx) => (
        <View key={item.id} style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>
            {item.title || `Video ${idx + 1}`}
          </Text>
          <ProgressBar item={item} />
          {item.error && <Text style={styles.error}>{item.error}</Text>}
        </View>
      ))}
    </View>
  );
}

function ProgressBar({ item }: { item: QueueItem }) {
  const pct = Math.round(item.progress * 100);
  const color =
    item.status === 'done' ? '#00d4aa' : item.status === 'failed' ? Colors.brandBlue : '#2E7DFF';
  return (
    <View style={styles.barWrap}>
      <View style={[styles.bar, { width: `${pct}%`, backgroundColor: color }]} />
      <Text style={styles.barLabel}>{progressLabel(item.status, item.progress)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 16,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  row: { marginBottom: 12 },
  name: { fontSize: 13, fontWeight: '600', color: Colors.text },
  error: { fontSize: 11, color: Colors.brandBlue, marginTop: 4, fontWeight: '600' },
  barWrap: {
    height: 24,
    backgroundColor: Colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
    justifyContent: 'center',
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  barLabel: { fontSize: 11, fontWeight: '800', color: Colors.text, textAlign: 'center', zIndex: 1 },
});
