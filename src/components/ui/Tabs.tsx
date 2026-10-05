import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';

export type Tab<T extends string> = { key: T; label: string };

type Props<T extends string> = {
  tabs: Tab<T>[];
  selected: T;
  onSelect: (key: T) => void;
};

/** Text tabs with an underline under the selected one; scrolls sideways when they do not fit. */
export function UnderlineTabs<T extends string>({ tabs, selected, onSelect }: Props<T>) {
  return (
    <View style={styles.underlineBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.underlineRow}
      >
        {tabs.map(tab => {
          const active = tab.key === selected;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.underlineTab}
              onPress={() => onSelect(tab.key)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.underlineText, active && styles.underlineTextActive]}>
                {tab.label}
              </Text>
              {active ? <View style={styles.underline} /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Rounded filter pills; the selected one is filled. */
export function PillTabs<T extends string>({ tabs, selected, onSelect }: Props<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pillRow}
    >
      {tabs.map(tab => {
        const active = tab.key === selected;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onSelect(tab.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  underlineBar: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  underlineRow: { paddingHorizontal: Spacing.lg, gap: Spacing.xs },
  underlineTab: { paddingHorizontal: 14, paddingVertical: Spacing.md, alignItems: 'center' },
  underlineText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  underlineTextActive: { color: Colors.text, fontWeight: FontWeight.extrabold },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: Spacing.sm,
    right: Spacing.sm,
    height: 3,
    backgroundColor: Colors.text,
    borderRadius: Radius.xs,
  },
  pillRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  pill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: { backgroundColor: Colors.brandBlue, borderColor: Colors.brandBlue },
  pillText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  pillTextActive: { color: Colors.white },
});
