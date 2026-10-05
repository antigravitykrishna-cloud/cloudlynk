import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius } from '@/constants/theme';
import { PressScale, fireHaptic } from '@/components/ui/Press';
import type { SubscriptionPlan } from '@/lib/data/plans';
import { durationLabel } from '@/lib/payments/checkout';

/**
 * One row per plan, radio style -- the same list the signed-out Profile shows (GuestPlans), so
 * choosing a plan looks the same before and after signing in.
 */
export function PlanRadioList({
  plans,
  selectedIndex,
  onSelect,
}: {
  plans: SubscriptionPlan[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View style={styles.list}>
      {plans.map((plan, i) => {
        const isSelected = selectedIndex === i;
        return (
          <PressScale
            key={plan.code}
            style={[styles.row, isSelected && styles.rowSelected]}
            onPress={() => {
              fireHaptic('selection');
              onSelect(i);
            }}
            scaleTo={0.98}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${plan.name}, ${plan.description}, ${plan.price_inr} rupees`}
          >
            <View style={[styles.radio, isSelected && styles.radioSelected]}>
              {isSelected && <View style={styles.radioInner} />}
            </View>
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{plan.name}</Text>
                {plan.is_popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText} numberOfLines={1}>
                      POPULAR
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.duration}>{durationLabel(plan.duration_days)}</Text>
            </View>
            <Text style={styles.price}>
              <Text style={styles.currency}>{'₹ '}</Text>
              {plan.price_inr}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rowSelected: { borderColor: Colors.brandBlue, backgroundColor: Colors.brandBlueDim },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#9FB0C9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.brandBlue },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.brandBlue },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: Colors.text },
  duration: { fontSize: 14, color: Colors.textSecondary, marginTop: 3 },
  popularBadge: {
    backgroundColor: Colors.brandBlue,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  popularBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  price: { fontSize: 20, fontWeight: '800', color: Colors.text },
  currency: { fontSize: 12, fontWeight: '700', color: Colors.text },
});
