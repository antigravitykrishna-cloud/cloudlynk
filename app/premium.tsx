import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import { useSubscriptionPlans } from '../lib/subscriptionService';
import { getIapService } from '../lib/services/iap';

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
  const { isActive, planStatus, isApproved, approvalStatus, refreshProfile } = useAuth();
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
        Alert.alert('Success', "You're now on Premium!", [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        Alert.alert('Purchase failed', result.errorMessage ?? 'Please try again.');
      }
    } catch (err: unknown) {
      Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Please try again.');
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
          <Text style={styles.pendingIcon}>{'✅'}</Text>
          <Text style={styles.pendingTitle}>{"You're on Premium!"}</Text>
          <Text style={styles.pendingText}>
            You now have full access to Premium movies, series, and shorts across Cloudlynk.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // v55 PRE-purchase approval gate. Deliberately placed AFTER the
  // already-subscribed branch above: if this account has actually paid, it
  // sees its entitlement here regardless of approval_status. Withholding
  // something already paid for is the exact pattern this gate exists to
  // avoid — see supabase/migrations/20260905120000_v55_user_approval_gate.sql.
  // Nothing else in the app is gated on approval: an unapproved account
  // browses, watches free content and uses cloud storage normally.
  if (!isApproved) {
    const rejected = approvalStatus === 'rejected';
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
          <Text style={styles.pendingIcon}>{rejected ? 'ℹ️' : '⏳'}</Text>
          <Text style={styles.pendingTitle}>
            {rejected ? 'Premium is not available for this account' : 'Your account is being reviewed'}
          </Text>
          <Text style={styles.pendingText}>
            {rejected
              ? 'Premium subscriptions are not available for this account right now. You can keep using Cloudlynk’s free features as normal. Contact support if you think this is a mistake.'
              : 'An admin needs to approve your account before you can subscribe to Premium. You’ll be notified once that’s done — everything else in Cloudlynk keeps working in the meantime.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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

        {/* Proceed button */}
        <TouchableOpacity
          style={[styles.proceedBtn, (plansLoading || purchasing) && { opacity: 0.5 }]}
          onPress={handleProceed}
          disabled={plansLoading || !selectedPlan || purchasing}
          activeOpacity={0.8}
        >
          {purchasing
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={styles.proceedBtnText}>Proceed to Payment</Text>
          }
        </TouchableOpacity>

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
  content: { paddingBottom: 40 },
  header: { backgroundColor: Colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { width: 80 },
  backTxt: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  badgeCard: { margin: 16, backgroundColor: '#ffe5e5', borderRadius: 16, padding: 18 },
  badgeHeader: { marginBottom: 14 },
  badgePill: { alignSelf: 'flex-start', backgroundColor: Colors.brand, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12 },
  badgePillText: { color: '#ffffff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  benefitCheck: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  benefitCheckText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  benefitText: { fontSize: 14, color: '#444', fontWeight: '500', flex: 1 },
  planSectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, marginLeft: 18, marginTop: 24, marginBottom: 12 },
  plansContainer: { paddingHorizontal: 16, gap: 10 },
  planCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, padding: 14, gap: 12 },
  planCardSelected: { borderColor: Colors.brand, backgroundColor: '#fff5f5' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
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
