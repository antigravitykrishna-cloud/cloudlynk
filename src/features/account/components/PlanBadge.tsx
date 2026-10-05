import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';

/** "✦ ACTIVE PLAN", linking to /premium; free accounts also see "Tap to Upgrade". */
export function PlanBadge({ planStatus, isPaid }: { planStatus: string; isPaid: boolean }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.badge}
      onPress={() => router.push('/premium')}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <Text style={styles.plan}>✦ {planStatus.toUpperCase()} PLAN</Text>
      {!isPaid ? <Text style={styles.upgrade}> · Tap to Upgrade</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brandBlueDim,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.brandBlue,
    marginBottom: Spacing.lg,
  },
  plan: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.black,
    color: Colors.brandBlue,
    letterSpacing: 0.5,
  },
  upgrade: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.semibold },
});
