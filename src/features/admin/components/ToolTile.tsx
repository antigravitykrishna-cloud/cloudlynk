import { StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/Press';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';

/** One admin tool on the dashboard grid, with an optional count badge. */
export function ToolTile({
  icon,
  label,
  hint,
  tint,
  badge,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint: string;
  tint: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <PressScale
      style={styles.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.icon, { backgroundColor: tint }]}>
        <Icon name={icon} size={18} color={Colors.text} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.hint} numberOfLines={2}>
        {hint}
      </Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '48%',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  label: { color: Colors.text, fontSize: FontSize.base, fontWeight: FontWeight.bold },
  hint: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 3, lineHeight: 16 },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: Colors.text, fontSize: FontSize.xs, fontWeight: FontWeight.extrabold },
});

export const toolGridStyle = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: Spacing.lg,
  },
}).grid;
