import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';

/** A tick box with its label beside it; the whole row toggles. */
export function Checkbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  /** The label: plain text, or text with links. */
  children: ReactNode;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.label}>{children}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: Spacing.lg },
  box: {
    width: 20,
    height: 20,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: { backgroundColor: Colors.brandBlue, borderColor: Colors.brandBlue },
  tick: { color: Colors.white, fontSize: FontSize.md, fontWeight: FontWeight.extrabold },
  label: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
});
