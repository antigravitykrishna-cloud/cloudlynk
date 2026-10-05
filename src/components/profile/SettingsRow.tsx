import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { Colors } from '@/constants/theme';
import { Icon, type IconName } from '@/components/ui/Icon';

export const SettingsRow = ({
  icon,
  iconBg,
  label,
  value,
  onPress,
  danger = false,
  toggle,
  toggleValue,
  onToggle,
}: {
  icon: IconName;
  iconBg: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
}) => (
  <TouchableOpacity
    style={styles.row}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    disabled={!onPress && !toggle}
  >
    <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
      <Icon name={icon} size={18} color={danger ? Colors.danger : Colors.brandBlue} />
    </View>
    <Text style={[styles.rowLabel, danger && { color: Colors.danger }]}>{label}</Text>
    {toggle ? (
      <Switch
        value={toggleValue}
        onValueChange={onToggle}
        trackColor={{ false: Colors.borderStrong, true: Colors.brandBlueDim }}
        thumbColor={toggleValue ? Colors.brandBlue : '#cccccc'}
      />
    ) : (
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {onPress ? <Icon name="chevron-right" size={16} color={Colors.textMuted} /> : null}
      </View>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
});
