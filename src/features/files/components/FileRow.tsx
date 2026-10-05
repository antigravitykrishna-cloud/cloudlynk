import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { formatBytes, formatTimeAgo } from '@/utils/format';
import type { StoredFile } from '@/features/files/api/filesApi';
import { CATEGORY_STYLE, type FileCategory } from '@/features/files/fileCategories';

/** One file in the Cloud tab: category icon, name, size and age. */
export function FileRow({ file, onPress }: { file: StoredFile; onPress: () => void }) {
  const style = CATEGORY_STYLE[file.category as FileCategory] ?? CATEGORY_STYLE.other;
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={onPress}>
      <View style={[styles.icon, { backgroundColor: style.tint }]}>
        <Icon name={style.icon} size={20} color={style.color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={styles.meta}>
          {formatBytes(file.size)} · {formatTimeAgo(file.created_at)}
        </Text>
      </View>
      <Text style={styles.more} accessibilityLabel="File options">
        ⋯
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  meta: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  more: {
    fontSize: FontSize.title,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
    padding: Spacing.sm,
  },
});
