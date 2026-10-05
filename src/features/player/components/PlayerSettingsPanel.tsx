import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing, withAlpha } from '@/theme';
import { QUALITY_OPTIONS, SPEED_OPTIONS } from '@/features/player/hooks/usePlayerPreferences';

/** Quality and speed choices, shown above the controls when the gear is tapped. */
export function PlayerSettingsPanel({
  quality,
  speed,
  onQualityChange,
  onSpeedChange,
}: {
  quality: string;
  speed: number;
  onQualityChange: (quality: string) => void;
  onSpeedChange: (speed: number) => void;
}) {
  return (
    <View style={styles.panel}>
      <OptionRow
        label="Quality"
        options={QUALITY_OPTIONS}
        selected={quality}
        format={q => q}
        onSelect={onQualityChange}
      />
      <OptionRow
        label="Speed"
        options={SPEED_OPTIONS}
        selected={speed}
        format={s => `${s}×`}
        onSelect={onSpeedChange}
      />
    </View>
  );
}

function OptionRow<T extends string | number>({
  label,
  options,
  selected,
  format,
  onSelect,
}: {
  label: string;
  options: T[];
  selected: T;
  format: (option: T) => string;
  onSelect: (option: T) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {options.map(option => {
        const active = option === selected;
        return (
          <TouchableOpacity
            key={option}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(option)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{format(option)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 130,
    left: 0,
    right: 0,
    backgroundColor: withAlpha(Colors.black, 0.92),
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    zIndex: 35,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.extrabold,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginRight: Spacing.xs,
    minWidth: 44,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.brandBlue, borderColor: Colors.brandBlue },
  chipText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  chipTextActive: { color: Colors.text },
});
