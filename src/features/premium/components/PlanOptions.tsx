import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { TextButton } from '@/components/ui/Button';
import { PressScale, fireHaptic } from '@/components/ui/Press';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import type { SubscriptionPlan } from '@/features/premium/api/plansApi';
import { durationLabel } from '@/features/premium/plans';

type Props = {
  plans: SubscriptionPlan[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  selectedCode: string | null;
  onSelect: (code: string) => void;
};

/**
 * The plans as radio rows, one per plan. The same list everywhere a plan is chosen, so picking one
 * looks the same before and after signing in.
 */
export function PlanOptions({ plans, loading, failed, onRetry, selectedCode, onSelect }: Props) {
  if (loading) return <ActivityIndicator color={Colors.brandBlue} style={styles.loading} />;

  if (failed || !plans?.length) {
    return (
      <View style={styles.failed}>
        <Text style={styles.failedText}>Couldn’t load the plans.</Text>
        <TextButton label="Try again" onPress={onRetry} />
      </View>
    );
  }

  return (
    <View accessibilityRole="radiogroup">
      {plans.map((plan, index) => (
        <Animated.View key={plan.code} entering={FadeInDown.delay(60 + index * 50).duration(260)}>
          <PlanRow
            plan={plan}
            selected={plan.code === selectedCode}
            onPress={() => {
              fireHaptic('selection');
              onSelect(plan.code);
            }}
          />
        </Animated.View>
      ))}
    </View>
  );
}

function PlanRow({
  plan,
  selected,
  onPress,
}: {
  plan: SubscriptionPlan;
  selected: boolean;
  onPress: () => void;
}) {
  const duration = durationLabel(plan.duration_days);
  return (
    <PressScale
      style={[styles.row, selected && styles.rowSelected]}
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${plan.name}, ${duration}, ${plan.price_inr} rupees`}
    >
      <View style={[styles.ring, selected && styles.ringSelected]}>
        {selected ? <View style={styles.dot} /> : null}
      </View>
      <View style={styles.details}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{plan.name}</Text>
          {plan.is_popular ? (
            <View style={styles.popular}>
              <Text style={styles.popularText}>POPULAR</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.duration}>{duration}</Text>
      </View>
      <Text style={styles.price}>
        <Text style={styles.currency}>₹ </Text>
        {plan.price_inr}
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: Spacing.xxxl },
  failed: { alignItems: 'center', paddingVertical: Spacing.xxl },
  failedText: { color: Colors.textSecondary, fontSize: FontSize.base },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  rowSelected: { borderColor: Colors.brandBlue, backgroundColor: Colors.brandBlueDim },
  ring: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSelected: { borderColor: Colors.brandBlue },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.brandBlue },
  details: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  popular: {
    backgroundColor: Colors.brandBlue,
    borderRadius: Radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  popularText: {
    color: Colors.text,
    fontSize: 9,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.4,
  },
  duration: { color: Colors.textSecondary, fontSize: FontSize.base, marginTop: 3 },
  price: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.extrabold },
  currency: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
