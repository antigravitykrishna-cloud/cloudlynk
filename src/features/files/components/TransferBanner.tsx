import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import type { Transfer } from '@/features/files/hooks/useFiles';

/** "2 uploads in progress · 40%", while anything is uploading. */
export function TransferBanner({ transfers }: { transfers: Transfer[] }) {
  if (transfers.length === 0) return null;
  const average = transfers.reduce((sum, t) => sum + t.progress, 0) / transfers.length;
  return (
    <View style={styles.banner}>
      <Icon name="upload" size={15} color={Colors.text} />
      <Text style={styles.text}>
        {transfers.length} upload{transfers.length > 1 ? 's' : ''} in progress
      </Text>
      <Text style={styles.percent}>{Math.round(average * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.brandBlueDim,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.brandBlue },
  percent: { fontSize: FontSize.sm, fontWeight: FontWeight.extrabold, color: Colors.brandBlue },
});
