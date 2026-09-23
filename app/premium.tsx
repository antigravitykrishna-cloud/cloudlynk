import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { showAlert } from '../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { setPostLoginRoute } from '../lib/postLogin';
import { GuestPlans } from '../components/GuestPlans';
import { Colors, Radius, FontSize, FontWeight } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import { useSubscriptionPlans } from '../lib/subscriptionService';
import { getIapService } from '../lib/services/iap';
import { config } from '../lib/config';
import {
  createGatewayOrder, getGatewayMethods, openRazorpay, waitForPayment,
  type GatewayMethod, type OrderStatus, type SabpaisaOrder,
} from '../lib/payments';
import { PaymentSheet, type PaymentChoice } from '../components/PaymentSheet';
import { SabpaisaCheckout } from '../components/SabpaisaCheckout';
import { logCheckoutStarted } from '../lib/metaAds';
import { Icon } from '../components/Icon';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PressScale, fireHaptic } from '../components/Press';

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
  const [restoring, setRestoring] = useState(false);

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

  // A guest is sent to sign in first; remember the plan so they come back
  // to it rather than to Explore.
  const signInForPlan = () => {
    setPostLoginRoute(
      selectedPlan
        ? { pathname: '/premium', params: { plan: selectedPlan.code } }
        : '/premium',
    );
    router.push('/(auth)/login');
  };

  // Google Play policy requires digital content to be sold exclusively
  // through Play Billing — the app never offers an alternate payment method
  // to unlock in-app content.
  // ── Paying ────────────────────────────────────────────────────────────
  //
  // Google Play plus, when the server has their keys, UPI / Razorpay /
  // Sabpaisa. How they are offered depends on config.alternativeBilling
  // (lib/config.ts):
  //   user_choice  Google Play's own choice screen comes first. If the
  //                person picks our option there, Google hands over a token
  //                and our payment sheet opens with the gateways.
  //   test         our sheet straight away, Google Play as one of its rows
  //                (sideloaded test builds only).
  //   off          Google Play only.
  const [gatewayMethods, setGatewayMethods] = useState<GatewayMethod[]>([]);
  const [sheet, setSheet] = useState<{ choices: PaymentChoice[]; token?: string } | null>(null);
  const [sabpaisaOrder, setSabpaisaOrder] = useState<SabpaisaOrder | null>(null);
  const [confirming, setConfirming] = useState(false);
  const sabpaisaOrderId = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || config.alternativeBilling === 'off') return;
    getGatewayMethods().then(setGatewayMethods);
  }, [user?.id]);

  const onPaid = async () => {
    // A completed purchase is the single most important confirmation in
    // the app; it should be felt as well as read.
    fireHaptic('success');
    await refreshProfile();
    showAlert('Success', "You're now on Premium!", [{ text: 'OK', onPress: goBack }]);
  };

  const reportGatewayResult = async (status: OrderStatus) => {
    if (status === 'paid') return onPaid();
    fireHaptic(status === 'failed' ? 'error' : 'warning');
    if (status === 'failed') {
      showAlert('Payment failed', 'No money was taken for this attempt. You can try again or pick another way to pay.');
    } else {
      showAlert(
        'Waiting for confirmation',
        'Your bank has not confirmed the payment yet. If money was deducted, Premium switches on by itself within a few minutes -- you do not need to pay again.',
      );
    }
  };

  const playPurchase = async (userChoiceBilling: boolean) => {
    if (!selectedPlan) return;
    setPurchasing(true);
    try {
      const result = await getIapService().purchasePlan(selectedPlan.code, { userChoiceBilling });
      if (result.alternativeBillingToken) {
        // Picked our option on Google's choice screen.
        setSheet({ choices: gatewayMethods, token: result.alternativeBillingToken });
      } else if (result.success) {
        await onPaid();
      } else {
        fireHaptic('error');
        showAlert('Purchase failed', result.errorMessage ?? 'Please try again.');
      }
    } catch (err: unknown) {
      showAlert('Purchase failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleProceed = async () => {
    if (!selectedPlan) return;
    logCheckoutStarted(selectedPlan.code, selectedPlan.price_inr);
    if (config.alternativeBilling === 'test' && gatewayMethods.length > 0) {
      const order: PaymentChoice[] = ['upi', 'play', 'razorpay', 'sabpaisa'];
      setSheet({ choices: order.filter(c => c === 'play' || gatewayMethods.includes(c as GatewayMethod)) });
      return;
    }
    await playPurchase(config.alternativeBilling === 'user_choice' && gatewayMethods.length > 0);
  };

  const payWith = async (choice: PaymentChoice) => {
    if (!selectedPlan) return;
    if (choice === 'play') {
      setSheet(null);
      await playPurchase(false);
      return;
    }
    setPurchasing(true);
    try {
      const order = await createGatewayOrder(selectedPlan.code, choice, sheet?.token);
      setSheet(null);
      if (order.provider === 'razorpay') {
        const result = await openRazorpay(order);
        setConfirming(true);
        // Without a checkout result the person most likely backed out, so do
        // not keep them waiting long -- but still ask, because a UPI payment
        // can go through even when the UPI app never reports back.
        await reportGatewayResult(await waitForPayment(order.orderId, result ?? undefined, result ? 45_000 : 8_000)
          .then(st => (st === 'pending' && !result ? 'failed' : st)));
      } else {
        sabpaisaOrderId.current = order.orderId;
        setSabpaisaOrder(order);
      }
    } catch (err: unknown) {
      showAlert('Payment failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setConfirming(false);
      setPurchasing(false);
    }
  };

  const onSabpaisaDone = async (how: 'returned' | 'closed') => {
    setSabpaisaOrder(null);
    const id = sabpaisaOrderId.current;
    sabpaisaOrderId.current = null;
    if (!id) return;
    setConfirming(true);
    try {
      const status = await waitForPayment(id, undefined, how === 'returned' ? 45_000 : 8_000);
      await reportGatewayResult(status === 'pending' && how === 'closed' ? 'failed' : status);
    } finally {
      setConfirming(false);
    }
  };

  // Play expects a way to recover an existing entitlement without paying
  // again. GooglePlayIapService.restorePurchases has always existed and no
  // screen called it, so a user who reinstalled, factory reset, or moved to a
  // new phone had no route back to a subscription they had already paid for --
  // the only visible option was to buy it a second time.
  const handleRestore = async () => {
    setRestoring(true);
    try {
      const results = await getIapService().restorePurchases();
      const restored = results.some(r => r.success);
      await refreshProfile();
      if (restored) {
        showAlert('Subscription restored', 'Your Premium access is active again.', [
          { text: 'OK', onPress: goBack },
        ]);
      } else {
        // Deliberately not phrased as a failure. The common case is someone
        // who never subscribed on this Google account, and telling them
        // something went wrong invites a support message about a bug.
        showAlert(
          'Nothing to restore',
          'No previous purchase was found for this Google account. If you subscribed with a different account, sign in to that one on this device and try again.',
        );
      }
    } catch (err: unknown) {
      showAlert('Could not restore', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  if (isActive || planStatus === 'lifetime') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
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

  // A guest gets the same plan picker as the signed-out Profile tab: choose,
  // Next, then a sign-in sheet. The client's reference flow, and one screen
  // for one job rather than two slightly different paywalls.
  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <GuestPlans onBack={goBack} initialPlan={planParam} />
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
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
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
          // One row per plan, radio style -- the same list the signed-out
          // Profile shows (components/GuestPlans.tsx), so choosing a plan looks
          // the same before and after signing in. Side-by-side tiles stopped
          // fitting once the lineup grew to five plans.
          <View style={styles.planList}>
            {(plans ?? []).map((plan, i) => {
              const isSelected = selectedPlanIndex === i;
              return (
                <PressScale
                  key={plan.code}
                  style={[styles.planRowItem, isSelected && styles.planRowItemSelected]}
                  onPress={() => { fireHaptic('selection'); setSelectedPlanIndex(i); }}
                  scaleTo={0.98}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${plan.name}, ${plan.description}, ${plan.price_inr} rupees`}
                >
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.planName}>{plan.name}</Text>
                      {plan.is_popular && (
                        <View style={styles.popularBadge}>
                          <Text style={styles.popularBadgeText} numberOfLines={1}>POPULAR</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.planDuration}>
                      {plan.duration_days >= 365 ? '1 year'
                        : plan.duration_days >= 180 ? '6 months'
                        : plan.duration_days >= 30 ? '1 month'
                        : `${plan.duration_days} days`}
                    </Text>
                  </View>
                  <Text style={styles.planPrice}>
                    <Text style={styles.planPriceCurrency}>{'₹ '}</Text>{plan.price_inr}
                  </Text>
                </PressScale>
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
          onPress={gate === 'guest' ? signInForPlan : handleProceed}
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
          <TouchableOpacity onPress={signInForPlan} activeOpacity={0.7}>
            <Text style={styles.gateSignIn}>I already have an account</Text>
          </TouchableOpacity>
        )}

        {/* Only for signed-in users: restoring resolves a Play purchase onto an
            account, so there has to be an account to resolve it onto. A guest
            is already being offered sign-in directly above. */}
        {!gate && (
          <TouchableOpacity onPress={handleRestore} disabled={restoring || purchasing} activeOpacity={0.7}>
            <Text style={[styles.restoreLink, (restoring || purchasing) && { opacity: 0.5 }]}>
              {restoring ? 'Restoring…' : 'Already subscribed? Restore purchase'}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.legal}>
          {gatewayMethods.length > 0
            ? 'Pay with Google Play, UPI or a card. Google Play plans renew until cancelled in Play Store settings; UPI and card payments buy a fixed period and do not renew.'
            : 'Billed via Google Play. Cancel anytime from Play Store settings.'}
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>

      {selectedPlan && (
        <PaymentSheet
          visible={!!sheet}
          choices={sheet?.choices ?? []}
          priceInr={selectedPlan.price_inr}
          planName={selectedPlan.name}
          busy={purchasing}
          onSelect={payWith}
          onClose={() => setSheet(null)}
        />
      )}
      <SabpaisaCheckout order={sabpaisaOrder} onDone={onSabpaisaDone} />
      {confirming && (
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
  restoreLink: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
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
  // Four-up plan ladder. Equal flex so no plan looks favoured by width —
  // emphasis is carried by the POPULAR tag and the selected border, both of
  // which are deliberate, where a wider column would be accidental.
  planList: { paddingHorizontal: 16, gap: 10 },
  planRowItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border, paddingVertical: 16, paddingHorizontal: 16,
  },
  planRowItemSelected: { borderColor: Colors.brand, backgroundColor: Colors.accentOrangeDim },
  planRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  planTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    minHeight: 104,
    justifyContent: 'center',
  },
  planTileSelected: { borderColor: Colors.brand, backgroundColor: Colors.accentOrangeDim, borderWidth: 2 },
  // Sits on the border rather than inside the tile, so it does not steal
  // vertical space from the price it is advertising.
  popularTag: {
    position: 'absolute', top: -9, alignSelf: 'center',
    backgroundColor: Colors.brand, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  popularTagText: { fontSize: 9, fontWeight: '800', color: '#ffffff', letterSpacing: 0.4 },
  tileTerm: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  tilePrice: { fontSize: FontSize.title, fontWeight: FontWeight.extrabold, color: Colors.text, marginTop: 4 },
  tileCurrency: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  tileDuration: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 3 },
  tileTextSelected: { color: Colors.text },

  planCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, padding: 14, gap: 12 },
  planCardSelected: { borderColor: Colors.brand, backgroundColor: Colors.accentOrangeDim },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#9FB0C9', alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: Colors.brand },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.brand },
  planInfo: { flex: 1 },
  planName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  planDuration: { fontSize: 14, color: Colors.textSecondary, marginTop: 3 },
  planDescription: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '500' },
  popularBadge: { backgroundColor: Colors.brand, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.xs },
  popularBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  planPriceWrap: { alignItems: 'flex-end' },
  planPrice: { fontSize: 20, fontWeight: '800', color: Colors.text },
  planPriceCurrency: { fontSize: 12, fontWeight: '700', color: Colors.text },
  proceedBtn: { marginHorizontal: 16, marginTop: 20, backgroundColor: Colors.brand, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  proceedBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  legal: { textAlign: 'center', fontSize: 11, color: Colors.textMuted, marginTop: 12, paddingHorizontal: 24 },
  confirmOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,18,32,0.88)',
    alignItems: 'center', justifyContent: 'center', gap: 14,
  },
  confirmText: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  pendingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  pendingIcon: { fontSize: 48, marginBottom: 16 },
  pendingTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  pendingText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
