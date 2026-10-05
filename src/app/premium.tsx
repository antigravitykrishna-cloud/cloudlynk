import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { showAlert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { fireHaptic } from '@/components/ui/Press';
import { GuestPlans } from '@/components/premium/GuestPlans';
import { PaymentSheet } from '@/components/premium/PaymentSheet';
import { SabpaisaCheckout } from '@/components/premium/SabpaisaCheckout';
import { PremiumHeader } from '@/components/premium/PremiumHeader';
import { GateBanner } from '@/components/premium/GateBanner';
import { PlanRadioList } from '@/components/premium/PlanRadioList';
import { Colors, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { usePremiumCheckout } from '@/hooks/usePremiumCheckout';
import { useSubscriptionPlans } from '@/lib/data/plans';
import { GATE_COPY, purchaseGate } from '@/lib/payments/checkout';

// Premium unlocks titles marked Premium (enforced server-side); it does not add storage. Keep this
// list to things the app really does -- Play reviewers compare it with the app.
const BENEFITS = [
  'Unlock Premium Movies & Web Series',
  'Support the channels and creators you follow',
];

export default function PremiumScreen() {
  const router = useRouter();
  const { user, hasActivePlan, isApproved, approvalStatus, refreshProfile, isGuest } = useAuth();
  const { data: plans, isLoading: plansLoading } = useSubscriptionPlans();

  const [selectedPlanIndex, setSelectedPlanIndex] = useState(2);
  const selectedPlan = plans?.[selectedPlanIndex];

  // ?plan=<code> preselects a plan. The signed-out Profile tab links here
  // with the plan the person tapped, so after signing in they land on the
  // plan they chose instead of whichever one this screen defaults to.
  const { plan: planParam } = useLocalSearchParams<{ plan?: string }>();
  useEffect(() => {
    if (!planParam || !plans) return;
    const i = plans.findIndex(p => p.code === planParam);
    if (i >= 0) setSelectedPlanIndex(i);
  }, [planParam, plans]);

  // Arriving from sign-in replaces the login screen, so there may be nothing
  // underneath to go back to.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));

  const onPaid = async () => {
    // A completed purchase is the single most important confirmation in
    // the app; it should be felt as well as read.
    fireHaptic('success');
    await refreshProfile();
    if (isGuest) {
      // A plan on a guest account is one uninstall away from being
      // lost. Saving the account is the very next thing they see.
      router.replace({ pathname: '/save-account', params: { reason: 'purchase' } } as never);
      return;
    }
    showAlert('Success', "You're now on Premium!", [{ text: 'OK', onPress: goBack }]);
  };

  const checkout = usePremiumCheckout({
    userId: user?.id,
    plan: selectedPlan,
    onPaid,
    onRestored: goBack,
    refreshProfile,
  });

  if (hasActivePlan) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <PremiumHeader onBack={goBack} />
        <View style={styles.activeContainer}>
          <Icon name="check-circle" size={16} color={Colors.success} />
          <Text style={styles.activeTitle}>{"You're on Premium!"}</Text>
          <Text style={styles.activeText}>
            You now have full access to Premium movies, series, and shorts across Cloudlynk.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // A guest gets the same plan picker as the signed-out Profile tab: choose,
  // Next, then a sign-in sheet. One screen for one job rather than two
  // slightly different paywalls.
  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <GuestPlans onBack={goBack} initialPlan={planParam} />
      </SafeAreaView>
    );
  }

  // Everyone sees the plans; only the button changes.
  const gate = purchaseGate({ isGuest, isApproved, approvalStatus });
  const blocked = gate === 'pending' || gate === 'rejected';
  const busy = checkout.purchasing;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PremiumHeader onBack={goBack} />

        {gate && <GateBanner gate={gate} />}

        <View style={styles.badgeCard}>
          <View style={styles.badgeHeader}>
            <View style={styles.badgePill}>
              <Text style={styles.badgePillText}>Premium</Text>
            </View>
          </View>
          {BENEFITS.map(benefit => (
            <View key={benefit} style={styles.benefitRow}>
              <View style={styles.benefitCheck}>
                <Text style={styles.benefitCheckText}>{'✓'}</Text>
              </View>
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.planSectionTitle}>Select Your Plan</Text>

        {plansLoading ? (
          <ActivityIndicator size="large" color={Colors.brandBlue} style={{ marginVertical: 40 }} />
        ) : (
          <PlanRadioList
            plans={plans ?? []}
            selectedIndex={selectedPlanIndex}
            onSelect={setSelectedPlanIndex}
          />
        )}

        {/* A pending or rejected account gets a disabled button that says
            why, rather than a live one that fails at the Play Store. */}
        <TouchableOpacity
          style={[
            styles.proceedBtn,
            (plansLoading || busy) && { opacity: 0.5 },
            blocked && styles.proceedBtnDisabled,
          ]}
          onPress={
            gate === 'save'
              ? () =>
                  router.push({
                    pathname: '/save-account',
                    params: { reason: 'subscribe' },
                  } as never)
              : checkout.proceed
          }
          disabled={blocked || plansLoading || (!gate && !selectedPlan) || busy}
          activeOpacity={0.8}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={[styles.proceedBtnText, blocked && styles.proceedBtnTextDisabled]}>
              {gate ? GATE_COPY[gate].button : 'Proceed to Payment'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Restoring resolves a Play purchase onto an account in good standing. */}
        {!gate && (
          <TouchableOpacity
            onPress={checkout.restore}
            disabled={checkout.restoring || busy}
            activeOpacity={0.7}
          >
            <Text style={[styles.restoreLink, (checkout.restoring || busy) && { opacity: 0.5 }]}>
              {checkout.restoring ? 'Restoring…' : 'Already subscribed? Restore purchase'}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.legal}>
          {checkout.gatewayMethods.length > 0
            ? 'Pay with Google Play, UPI or a card. Google Play plans renew until cancelled in Play Store settings; UPI and card payments buy a fixed period and do not renew.'
            : 'Billed via Google Play. Cancel anytime from Play Store settings.'}
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>

      {selectedPlan && (
        <PaymentSheet
          visible={!!checkout.sheet}
          choices={checkout.sheet?.choices ?? []}
          priceInr={selectedPlan.price_inr}
          planName={selectedPlan.name}
          busy={busy}
          onSelect={checkout.payWith}
          onClose={checkout.closeSheet}
        />
      )}
      <SabpaisaCheckout order={checkout.sabpaisaOrder} onDone={checkout.onSabpaisaDone} />
      {checkout.confirming && (
        <View style={styles.confirmOverlay}>
          <ActivityIndicator color="#FFFFFF" size="large" />
          <Text style={styles.confirmText}>Confirming your payment…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: 40 },
  badgeCard: { margin: 16, backgroundColor: Colors.brandBlueDim, borderRadius: 16, padding: 18 },
  badgeHeader: { marginBottom: 14 },
  badgePill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.brandBlue,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgePillText: { color: '#ffffff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  benefitCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitCheckText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  benefitText: { fontSize: 14, color: '#9FB0C9', fontWeight: '500', flex: 1 },
  planSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    marginLeft: 18,
    marginTop: 24,
    marginBottom: 12,
  },
  proceedBtn: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: Colors.brandBlue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  proceedBtnDisabled: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  proceedBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  proceedBtnTextDisabled: { color: Colors.textMuted },
  restoreLink: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  legal: {
    textAlign: 'center',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 12,
    paddingHorizontal: 24,
  },
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,18,32,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  confirmText: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  activeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  activeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  activeText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
