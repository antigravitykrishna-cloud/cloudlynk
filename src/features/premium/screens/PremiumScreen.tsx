import { ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, TextButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { BenefitsCard } from '@/features/premium/components/BenefitsCard';
import { GuestPlans } from '@/features/premium/components/GuestPlans';
import { PaymentConfirmingOverlay } from '@/features/premium/components/PaymentConfirmingOverlay';
import { PaymentSheet } from '@/features/premium/components/PaymentSheet';
import { PlanOptions } from '@/features/premium/components/PlanOptions';
import { PurchaseGateBanner } from '@/features/premium/components/PurchaseGateBanner';
import { SabpaisaCheckout } from '@/features/premium/components/SabpaisaCheckout';
import { usePremiumCheckout } from '@/features/premium/hooks/usePremiumCheckout';
import {
  useSelectedPlan,
  useSubscriptionPlans,
} from '@/features/premium/hooks/useSubscriptionPlans';
import { PURCHASE_GATE_COPY, purchaseGate } from '@/features/premium/purchaseGate';

// /premium. Signed out: the guest plan picker. On Premium already: a confirmation. Otherwise the
// plans and the checkout. `?plan=<code>` preselects a plan, so someone who picked one before
// signing in lands on the plan they chose.

export default function PremiumScreen() {
  const router = useRouter();
  const { plan: requestedPlan } = useLocalSearchParams<{ plan?: string }>();
  const { user, hasActivePlan } = useAuth();

  // Arriving from sign-in replaces the login screen, so there may be nothing underneath.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));

  if (!user) {
    return (
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <GuestPlans onBack={goBack} initialPlan={requestedPlan} />
      </SafeAreaView>
    );
  }

  if (hasActivePlan) {
    return (
      <SafeAreaView style={styles.page} edges={['top']}>
        <ScreenHeader title="Premium" onBack={goBack} />
        <EmptyState
          icon="check-circle"
          title="You're on Premium!"
          message="You now have full access to Premium movies, series, and shorts across Cloudlynk."
        />
      </SafeAreaView>
    );
  }

  return <Checkout requestedPlan={requestedPlan} onDone={goBack} />;
}

function Checkout({ requestedPlan, onDone }: { requestedPlan?: string; onDone: () => void }) {
  const router = useRouter();
  const access = useAuth();
  const plans = useSubscriptionPlans();
  const { selectedCode, selectedPlan, select } = useSelectedPlan(plans.data, requestedPlan);
  const checkout = usePremiumCheckout(selectedPlan, onDone);

  // Everyone sees the plans; only the button changes. A pending or rejected account gets a
  // disabled button that says why, rather than a live one that fails at the Play Store.
  const gate = purchaseGate(access);
  const blocked = gate === 'pending' || gate === 'rejected';
  const saveAccountFirst = () =>
    router.push({ pathname: '/save-account', params: { reason: 'subscribe' } });

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScreenHeader title="Premium" onBack={onDone} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {gate ? <PurchaseGateBanner gate={gate} /> : null}
        <BenefitsCard />

        <Text style={styles.sectionTitle}>Select Your Plan</Text>
        <PlanOptions
          plans={plans.data}
          loading={plans.isLoading}
          failed={plans.isError}
          onRetry={plans.refetch}
          selectedCode={selectedCode}
          onSelect={select}
        />

        <Button
          label={gate ? PURCHASE_GATE_COPY[gate].button : 'Proceed to Payment'}
          size="lg"
          variant={blocked ? 'secondary' : 'primary'}
          onPress={gate === 'save' ? saveAccountFirst : checkout.proceed}
          busy={checkout.purchasing}
          disabled={blocked || plans.isLoading || (!gate && !selectedPlan)}
          style={styles.proceed}
        />

        {/* Restoring resolves a Play purchase onto an account, so only an account that could buy
            is offered it. */}
        {!gate ? (
          <TextButton
            label={checkout.restoring ? 'Restoring…' : 'Already subscribed? Restore purchase'}
            tone="muted"
            onPress={checkout.restore}
            disabled={checkout.restoring || checkout.purchasing}
          />
        ) : null}

        <Text style={styles.legal}>
          {checkout.hasGateways
            ? 'Pay with Google Play, UPI or a card. Google Play plans renew until cancelled in Play Store settings; UPI and card payments buy a fixed period and do not renew.'
            : 'Billed via Google Play. Cancel anytime from Play Store settings.'}
        </Text>
      </ScrollView>

      {selectedPlan ? (
        <PaymentSheet
          visible={!!checkout.sheet}
          choices={checkout.sheet?.choices ?? []}
          priceInr={selectedPlan.price_inr}
          planName={selectedPlan.name}
          busy={checkout.purchasing}
          onSelect={checkout.payWith}
          onClose={checkout.closeSheet}
        />
      ) : null}
      <SabpaisaCheckout order={checkout.sabpaisaOrder} onDone={checkout.finishSabpaisa} />
      {checkout.confirming ? <PaymentConfirmingOverlay /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingBottom: 64 },
  sectionTitle: {
    color: Colors.text,
    fontSize: FontSize.subhead,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.md,
  },
  proceed: { marginTop: Spacing.sm },
  legal: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
});
