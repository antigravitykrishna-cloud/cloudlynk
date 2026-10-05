import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';

type Props = {
  icon: IconName;
  /** The icon tile's background; a tint that hints at the row's area (admin, billing...). */
  iconBackground?: string;
  label: string;
  /** A second, smaller line under the label. */
  hint?: string;
  /** A short value on the right, e.g. "3 new". */
  value?: string;
  onPress?: () => void;
  /** A switch instead of a chevron. */
  toggle?: { value: boolean; onChange: (value: boolean) => void };
};

/** One row of a settings list: icon, label, and a chevron, value or switch. */
export function SettingsRow({
  icon,
  iconBackground = Colors.surfaceElevated,
  label,
  hint,
  value,
  onPress,
  toggle,
}: Props) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
      accessibilityRole={toggle ? undefined : 'button'}
    >
      <View style={[styles.icon, { backgroundColor: iconBackground }]}>
        <Icon name={icon} size={18} color={Colors.brandBlue} />
      </View>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          trackColor={{ false: Colors.borderStrong, true: Colors.brandBlueDim }}
          thumbColor={toggle.value ? Colors.brandBlue : Colors.textSecondary}
          accessibilityLabel={label}
        />
      ) : (
        <View style={styles.trailing}>
          {value ? <Text style={styles.value}>{value}</Text> : null}
          {onPress ? <Icon name="chevron-right" size={16} color={Colors.textMuted} /> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  label: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text },
  hint: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 3, lineHeight: 16 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  value: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.semibold },
});
