import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { formatBytes } from '@/lib/data/files';
import { storagePercent } from './shared';

const DEFAULT_LIMIT = 15 * 1024 * 1024 * 1024;

/** Storage used against the account's limit. */
export function StorageCard({ used, limit }: { used?: number; limit?: number }) {
  const pct = used !== undefined && limit !== undefined ? storagePercent(used, limit) : 0;
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Storage</Text>
        <Text style={styles.pct}>{`${pct.toFixed(1)}%`}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.sub}>
        {formatBytes(used ?? 0)} used of {formatBytes(limit ?? DEFAULT_LIMIT)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Colors.bg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 14, fontWeight: '700', color: Colors.text },
  pct: { fontSize: 14, fontWeight: '900', color: Colors.brandBlue },
  track: {
    height: 6,
    backgroundColor: Colors.surfaceHover,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  fill: { height: '100%', backgroundColor: Colors.brandBlue, borderRadius: 4 },
  sub: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
});
