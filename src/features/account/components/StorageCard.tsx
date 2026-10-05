import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { formatBytes } from '@/utils/format';
import { DEFAULT_STORAGE_LIMIT_BYTES, storagePercent } from '@/features/account/storage';

/** How much of the person's cloud storage is in use. */
export function StorageCard({ used, limit }: { used: number; limit: number }) {
  const percent = storagePercent(used, limit);
  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Storage</Text>
        <Text style={styles.percent}>{percent.toFixed(1)}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.detail}>
        {formatBytes(used)} used of {formatBytes(limit || DEFAULT_STORAGE_LIMIT_BYTES)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  percent: { fontSize: FontSize.base, fontWeight: FontWeight.black, color: Colors.brandBlue },
  track: {
    height: 6,
    backgroundColor: Colors.surfaceHover,
    borderRadius: Radius.xs,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  fill: { height: '100%', backgroundColor: Colors.brandBlue, borderRadius: Radius.xs },
  detail: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
});
