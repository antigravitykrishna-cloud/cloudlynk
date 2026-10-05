import { StyleSheet, Text } from 'react-native';
import { Colors, FontSize, Spacing } from '@/theme';
import { BenefitsCard } from '@/features/premium/components/BenefitsCard';
import { PlanOptions } from '@/features/premium/components/PlanOptions';
import { useSubscriptionPlans } from '@/features/premium/hooks/useSubscriptionPlans';

/**
 * Benefits, plan rows and the billing note, with no header or button, so a screen can place it
 * where it wants: the whole page for a signed-out visitor (GuestPlans), or the top of Profile for
 * a member without a plan.
 */
export function PlanPicker({
  selectedCode,
  onSelect,
}: {
  selectedCode: string | null;
  onSelect: (code: string) => void;
}) {
  const plans = useSubscriptionPlans();
  return (
    <>
      <BenefitsCard />
      <PlanOptions
        plans={plans.data}
        loading={plans.isLoading}
        failed={plans.isError}
        onRetry={plans.refetch}
        selectedCode={selectedCode}
        onSelect={onSelect}
      />
      <Text style={styles.footnote}>
        Billed through Google Play. A free account includes 15 GB of storage.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  footnote: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
});
