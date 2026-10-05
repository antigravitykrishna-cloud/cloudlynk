import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Link } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';

/**
 * "I agree to the Terms of Service, Community Guidelines, and Privacy Policy", with each policy a
 * link. Ticking it is the acceptance that complianceApi records.
 */
export function PolicyCheckbox({
  checked,
  onToggle,
  prefix = 'I agree to the',
}: {
  checked: boolean;
  onToggle: () => void;
  prefix?: string;
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
      <Text style={styles.text}>
        {prefix}{' '}
        <Link href="/terms" style={styles.link}>
          Terms of Service
        </Link>
        ,{' '}
        <Link href="/community-guidelines" style={styles.link}>
          Community Guidelines
        </Link>
        , and{' '}
        <Link href="/privacy" style={styles.link}>
          Privacy Policy
        </Link>
        .
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: Spacing.lg,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: { backgroundColor: Colors.brandBlue, borderColor: Colors.brandBlue },
  tick: { color: Colors.white, fontSize: FontSize.md, fontWeight: FontWeight.extrabold },
  text: { flex: 1, fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 18 },
  link: { color: Colors.brandBlue },
});
