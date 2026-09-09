import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { showAlert } from '../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Radius, FontSize, FontWeight } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import { useSubscriptionPlans } from '../lib/subscriptionService';
import { getIapService } from '../lib/services/iap';
import { Icon } from '../components/Icon';

// v52: Premium no longer sells storage — every account (free or premium)
// gets the same 15GB. Premium instead unlocks movies/series/shorts the
// creator has flagged as premium (channel_posts.access_level), enforced
// server-side via RLS — see the v52 migration and lib/posts.ts
// defaultAccessLevel(). Deliberately a short, honest list: "No Ads" isn't
// listed because no ad is shown anywhere in the app yet (lib/ads.ts exists
// but nothing currently renders a BannerAd/interstitial), and "priority
// upload speed" / "early access" have no backing mechanism — don't
// re-add store-listing-style claims here without also wiring up the
// enforcement, or Data Safety/Play listing reviewers will find a real gap
// between what's promised and what the app does.
const BENEFITS = [
  'Unlock Premium Movies & Web Series',
  'Support the channels and creators you follow',
];

export default function PremiumScreen() {
  const router = useRouter();
  const { user, isActive, planStatus, isApproved, approvalStatus, refreshProfile } = useAuth();
  const { data: plans, isLoading: plansLoading } = useSubscriptionPlans();

  const [selectedPlanIndex, setSelectedPlanIndex] = useState(2);
  const [purchasing, setPurchasing] = useState(false);

  const selectedPlan = plans?.[selectedPlanIndex];

  // Google Play policy requires digital content to be sold exclusively
  // through Play Billing — the app never offers an alternate payment method
  // to unlock in-app content.
  const handleProceed = async () => {
    if (!selectedPlan) return;
    setPurchasing(true);
    try {
      const result = await getIapService().purchasePlan(selectedPlan.code);
      if (result.success) {
        await refreshProfile();
        showAlert('Success', "You're now on Premium!", [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        showAlert('Purchase failed', result.errorMessage ?? 'Please try again.');
      }
    } catch (err: unknown) {
      showAlert('Purchase failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  if (isActive || planStatus === 'lifetime') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backTxt}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Premium</Text>
          <View style={{ width: 80 }} />
        </View>
        <View style={styles.pendingContainer}>
          <Icon name="check-circle" size={16} color={Colors.success} />
          <Text style={styles.pendingTitle}>{"You're on Premium!"}</Text>
          <Text style={styles.pendingText}>
            You now have full access to Premium movies, series, and shorts across Cloudlynk.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // v55 approval gate — enforced on the PURCHASE, not on the page.
  //
  // This used to early-return a "your account is being reviewed" screen, so a
  // guest and a pending user never saw what Premium costs or what it includes.
  // That hides the pitch from precisely the two audiences it needs to reach:
  // someone deciding whether to make an account, and someone waiting on
  // approval and wondering whether it is worth waiting for.
  //
  // Everyone sees the benefits and the four prices. Only the button changes.
  const gate: 'guest' | 'pending' | 'rejected' | null =
    !user ? 'guest'
    : approvalStatus === 'rejected' ? 'rejected'
    : !isApproved ? 'pending'
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backTxt}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Premium</Text>
          <View style={{ width: 80 }} />
        </View>

        {gate && (
          <View style={[styles.gateBanner, gate === 'rejected' && styles.gateBannerMuted]}>
            <Text style={styles.gateBannerTitle}>
              {gate === 'guest' ? 'Create a free account to subscribe'
               : gate === 'rejected' ? 'Premium is not available for this account'
               : 'Your account is being reviewed'}
            </Text>
            <Text style={styles.gateBannerText}>
              {gate === 'guest'
                ? "Here's everything Premium includes. Making an account is free and takes a moment."
                : gate === 'rejected'
                ? 'You can keep using Cloudlynk’s free features as normal. Contact support if you think this is a mistake.'
                : 'An admin approves new accounts before they can subscribe. You’ll be notified once that’s done — everything else in Cloudlynk keeps working in the meantime.'}
            </Text>
          </View>
        )}

        {/* Benefits card */}
        <View style={styles.badgeCard}>
          <View style={styles.badgeHeader}>
            <View style={styles.badgePill}>
              <Text style={styles.badgePillText}>Premium</Text>
            </View>
          </View>
          {BENEFITS.map((benefit) => (
            <View key={benefit} style={styles.benefitRow}>
              <View style={styles.benefitCheck}>
                <Text style={styles.benefitCheckText}>{'✓'}</Text>
              </View>
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        {/* Plan selection */}
        <Text style={styles.planSectionTitle}>Select Your Plan</Text>

        {plansLoading ? (
          <ActivityIndicator size="large" color={Colors.brand} style={{ marginVertical: 40 }} />
        ) : (
          <View style={styles.plansContainer}>
            {(plans ?? []).map((plan, i) => {
              const isSelected = selectedPlanIndex === i;
              return (
                <TouchableOpacity
                  key={plan.code}
                  style={[styles.planCard, isSelected && styles.planCardSelected]}
                  onPress={() => setSelectedPlanIndex(i)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.planInfo}>
                    {plan.is_popular && (
                      <View style={styles.popularBadge}>
                        <Text style={styles.popularBadgeText}>POPULAR</Text>
                      </View>
                    )}
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planDuration}>{plan.duration_days} days</Text>
                    <Text style={styles.planDescription}>{plan.description}</Text>
                  </View>
                  <View style={styles.planPriceWrap}>
                    <Text style={styles.planPrice}>
                      <Text style={styles.planPriceCurrency}>{'₹'}</Text>
                      {plan.price_inr}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Proceed button. A guest gets a route forward; a pending or
            rejected account gets a disabled button that says why, rather than
            a live one that fails at the Play Store. */}
        <TouchableOpacity
          style={[
            styles.proceedBtn,
            (plansLoading || purchasing) && { opacity: 0.5 },
            (gate === 'pending' || gate === 'rejected') && styles.proceedBtnDisabled,
          ]}
          // The one-tap chooser, not the old password form — see the note in
          // app/(tabs)/explore.tsx. A guest here is mid-purchase, which is the
          // worst possible moment to ask for a password they have to invent.
          onPress={gate === 'guest' ? () => router.push('/(auth)/login') : handleProceed}
          disabled={gate === 'pending' || gate === 'rejected' || plansLoading || (!gate && !selectedPlan) || purchasing}
          activeOpacity={0.8}
        >
          {purchasing
            ? <ActivityIndicator color="#ffffff" />
            : (
              <Text style={[
                styles.proceedBtnText,
                (gate === 'pending' || gate === 'rejected') && styles.proceedBtnTextDisabled,
              ]}>
                {gate === 'guest' ? 'Create free account'
                 : gate === 'pending' ? 'Awaiting admin approval'
                 : gate === 'rejected' ? 'Not available'
                 : 'Proceed to Payment'}
              </Text>
            )
          }
        </TouchableOpacity>

        {gate === 'guest' && (
          <TouchableOpacity onPress={() => router.push('/(auth)/login')} activeOpacity={0.7}>
            <Text style={styles.gateSignIn}>I already have an account</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.legal}>
          Billed via Google Play. Cancel anytime from Play Store settings.
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  gateBanner: {
    marginHorizontal: 16, marginTop: 16, padding: 16,
    backgroundColor: Colors.accentOrangeDim,
    borderWidth: 1, borderColor: Colors.accentBorder,
    borderRadius: Radius.lg,
  },
  gateBannerMuted: {
    backgroundColor: 'rgba(159,176,201,0.10)',
    borderColor: Colors.border,
  },
  gateBannerTitle: {
    color: Colors.text, fontSize: FontSize.lg,
    fontWeight: FontWeight.bold, marginBottom: 6,
  },
  gateBannerText: { color: Colors.textSecondary, fontSize: FontSize.base, lineHeight: 19 },
  proceedBtnDisabled: { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border },
  proceedBtnTextDisabled: { color: Colors.textMuted },
  gateSignIn: {
    color: Colors.brandBlue, fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold, textAlign: 'center', marginTop: 14,
  },
  content: { paddingBottom: 40 },
  header: { backgroundColor: Colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { width: 80 },
  backTxt: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  badgeCard: { margin: 16, backgroundColor: Colors.accentOrangeDim, borderRadius: 16, padding: 18 },
  badgeHeader: { marginBottom: 14 },
  badgePill: { alignSelf: 'flex-start', backgroundColor: Colors.brand, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12 },
  badgePillText: { color: '#ffffff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  benefitCheck: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  benefitCheckText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  benefitText: { fontSize: 14, color: '#9FB0C9', fontWeight: '500', flex: 1 },
  planSectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, marginLeft: 18, marginTop: 24, marginBottom: 12 },
  plansContainer: { paddingHorizontal: 16, gap: 10 },
  planCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, padding: 14, gap: 12 },
  planCardSelected: { borderColor: Colors.brand, backgroundColor: Colors.accentOrangeDim },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#9FB0C9', alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: Colors.brand },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.brand },
  planInfo: { flex: 1 },
  planName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  planDuration: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  planDescription: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '500' },
  popularBadge: { alignSelf: 'flex-start', backgroundColor: Colors.brand, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  popularBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  planPriceWrap: { alignItems: 'flex-end' },
  planPrice: { fontSize: 20, fontWeight: '800', color: Colors.text },
  planPriceCurrency: { fontSize: 12, fontWeight: '700', color: Colors.text },
  proceedBtn: { marginHorizontal: 16, marginTop: 20, backgroundColor: Colors.brand, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  proceedBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  legal: { textAlign: 'center', fontSize: 11, color: Colors.textMuted, marginTop: 12, paddingHorizontal: 24 },
  pendingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  pendingIcon: { fontSize: 48, marginBottom: 16 },
  pendingTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  pendingText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
