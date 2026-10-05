import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { CATEGORY_FILTERS, type FileCategory } from '@/features/files/fileCategories';

/** The All / Photos / Videos / Docs / Audio chips above the file list. */
export function CategoryFilter({
  selected,
  onSelect,
}: {
  selected: FileCategory | 'all';
  onSelect: (category: FileCategory | 'all') => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {CATEGORY_FILTERS.map(filter => {
        const active = filter.key === selected;
        return (
          <TouchableOpacity
            key={filter.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(filter.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Icon
              name={filter.icon}
              size={15}
              color={active ? Colors.brandBlue : Colors.textMuted}
            />
            <Text style={[styles.label, active && styles.labelActive]}>{filter.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 14,
    borderRadius: Radius.xl,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.brandBlueDim, borderColor: Colors.brandBlue },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  labelActive: { color: Colors.brandBlue },
});
