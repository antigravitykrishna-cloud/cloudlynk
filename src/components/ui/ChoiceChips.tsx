import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';

export type Choice<T extends string> = { value: T; label: string; icon?: IconName };

/** A row of equal-width chips for one choice out of a few, e.g. Movie / Series / Short / Post. */
export function ChoiceChips<T extends string>({
  label,
  choices,
  value,
  onChange,
  hint,
}: {
  label?: string;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row} accessibilityRole="radiogroup">
        {choices.map(choice => {
          const selected = choice.value === value;
          return (
            <TouchableOpacity
              key={choice.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(choice.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              {choice.icon ? (
                <Icon
                  name={choice.icon}
                  size={15}
                  color={selected ? Colors.brandBlue : Colors.textSecondary}
                />
              ) : null}
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {choice.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: Spacing.lg },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  row: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: { borderColor: Colors.brandBlue, backgroundColor: Colors.brandBlueDim },
  chipText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.bold },
  chipTextSelected: { color: Colors.brandBlue },
  hint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs, lineHeight: 16 },
});
