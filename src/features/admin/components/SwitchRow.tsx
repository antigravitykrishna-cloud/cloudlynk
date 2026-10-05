import { StyleSheet, Switch, Text, View } from 'react-native';
import { Colors, Spacing } from '@/theme';
import { adminStyles } from '@/features/admin/components/adminStyles';

/** A labelled on/off setting inside an admin card. */
export function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  /** What switching it does, under the label. */
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={adminStyles.value}>{label}</Text>
        {hint ? <Text style={adminStyles.muted}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.borderStrong, true: Colors.brandBlue }}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  text: { flex: 1 },
});
