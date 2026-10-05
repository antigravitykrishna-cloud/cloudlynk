import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';

export type Option<T extends string> = { value: T; label: string };

/** One choice out of a few, laid out in a row, e.g. Public / Private. */
export function RadioGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map(option => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={styles.option}
            onPress={() => onChange(option.value)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <View style={[styles.ring, selected && styles.ringSelected]}>
              {selected ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.label}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.xxxl, marginBottom: Spacing.lg },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSelected: { borderColor: Colors.brandBlue },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.brandBlue },
  label: { fontSize: FontSize.base, color: Colors.text, fontWeight: FontWeight.semibold },
});
