import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { useSubscriptionPlans, type SubscriptionPlan } from '../lib/subscriptionService';
import { setPostLoginRoute } from '../lib/postLogin';
import { PressScale, fireHaptic } from './Press';
import { Icon } from './Icon';

// The Profile tab for someone who is not signed in.
//
// The client asked for the plans to be the first thing here, with sign-in
// asked for only once a plan is picked. The old screen was a generic
// "sign in to see your profile" prompt with the prices one tap further in,
// so the most persuasive thing the tab could show was hidden behind a link.
//
// Tapping a plan does not try to buy anything: purchases need an account to
// attach the entitlement to. It sends the person to sign in and remembers the
// plan (lib/postLogin.ts), so after signing in they land on /premium with that
// plan already selected, one tap from paying.

const BENEFITS = [
  'Every premium movie and web series',
  'Premium channels unlocked in your feed',
  'Cancel anytime from Google Play',
];

function termLabel(days: number): string {
  if (days >= 365) return 'per year';
  if (days >= 180) return 'per 6 months';
  if (days >= 30) return 'per month';
  return days === 7 ? 'per week' : `for ${days} days`;
}

export function GuestPlans() {
  const router = useRouter();
  const { data: plans, isLoading, isError, refetch } = useSubscriptionPlans();

  const choosePlan = (plan: SubscriptionPlan) => {
    fireHaptic('selection');
    setPostLoginRoute({ pathname: '/premium', params: { plan: plan.code } });
    router.push('/(auth)/login');
  };

  const signIn = () => {
    // A plain sign-in from here is not a purchase, so do not replay one.
    setPostLoginRoute(null);
    router.push('/(auth)/login');
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.largeTitle}>Profile</Text>

      <Animated.View entering={FadeInDown.duration(280)} style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="diamond" size={26} color={Colors.brandCyan} />
        </View>
        <Text style={styles.heroTitle}>Go Premium</Text>
        <Text style={styles.heroText}>
          Pick a plan to unlock everything on Cloudlynk. You’ll sign in on the next step.
        </Text>
        <View style={styles.benefits}>
          {BENEFITS.map(b => (
            <View key={b} style={styles.benefitRow}>
              <Icon name="check-circle" size={16} color={Colors.success} />
              <Text style={styles.benefitText}>{b}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <Text style={styles.sectionLabel}>CHOOSE A PLAN</Text>

      {isLoading ? (
        <ActivityIndicator color={Colors.brandBlue} style={{ marginVertical: Spacing.xxxl }} />
      ) : isError || !plans?.length ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Couldn’t load the plans.</Text>
          <TouchableOpacity onPress={() => refetch()} activeOpacity={0.7}>
            <Text style={styles.retry}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        plans.map((plan, i) => (
          <Animated.View key={plan.code} entering={FadeInDown.delay(60 + i * 50).duration(260)}>
            <PressScale
              style={[styles.planCard, plan.is_popular && styles.planCardPopular]}
              onPress={() => choosePlan(plan)}
              accessibilityRole="button"
              accessibilityLabel={`${plan.name}, ${plan.price_inr} rupees ${termLabel(plan.duration_days)}. Sign in to subscribe.`}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {plan.is_popular && (
                    <View style={styles.popularTag}>
                      <Text style={styles.popularTagText}>MOST POPULAR</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planDesc}>{plan.description}</Text>
              </View>
              <View style={styles.priceCol}>
                <Text style={styles.price}>
                  <Text style={styles.currency}>₹</Text>{plan.price_inr}
                </Text>
                <Text style={styles.term}>{termLabel(plan.duration_days)}</Text>
              </View>
              <Icon name="chevron-right" size={16} color={Colors.textMuted} />
            </PressScale>
          </Animated.View>
        ))
      )}

      <TouchableOpacity onPress={signIn} activeOpacity={0.7} style={styles.signInWrap}>
        <Text style={styles.signInText}>
          Already have an account? <Text style={styles.signInLink}>Sign in</Text>
        </Text>
      </TouchableOpacity>

      <Text style={styles.footnote}>
        Billed through Google Play. A free account includes 15 GB of storage.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxxl },
  largeTitle: {
    color: Colors.text, fontSize: FontSize.xxxl, fontWeight: FontWeight.extrabold,
    letterSpacing: -0.5, marginTop: Spacing.lg, marginBottom: Spacing.lg, marginLeft: Spacing.xs,
  },
  hero: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    padding: Spacing.xl,
  },
  heroIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.accentGreenDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  heroTitle: { color: Colors.text, fontSize: FontSize.xxl, fontWeight: FontWeight.bold, letterSpacing: -0.3 },
  heroText: { color: Colors.textSecondary, fontSize: FontSize.subhead, lineHeight: 21, marginTop: 6 },
  benefits: { marginTop: Spacing.lg, gap: 10 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { color: Colors.text, fontSize: FontSize.base, fontWeight: FontWeight.semibold, flex: 1 },
  sectionLabel: {
    color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: FontWeight.semibold,
    letterSpacing: 0.6, marginTop: Spacing.xxl, marginBottom: Spacing.sm, marginLeft: Spacing.xs,
  },
  planCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg, marginBottom: 10,
  },
  planCardPopular: { borderColor: Colors.brandBlue, backgroundColor: Colors.accentOrangeDim },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  planName: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  popularTag: { backgroundColor: Colors.brandBlue, borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: 2 },
  popularTagText: { color: '#FFFFFF', fontSize: 9, fontWeight: FontWeight.extrabold, letterSpacing: 0.4 },
  planDesc: { color: Colors.textSecondary, fontSize: FontSize.md, marginTop: 3 },
  priceCol: { alignItems: 'flex-end' },
  price: { color: Colors.text, fontSize: FontSize.title, fontWeight: FontWeight.extrabold },
  currency: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  term: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  errorBox: { alignItems: 'center', paddingVertical: Spacing.xxl },
  errorText: { color: Colors.textSecondary, fontSize: FontSize.base },
  retry: { color: Colors.brandBlue, fontSize: FontSize.base, fontWeight: FontWeight.semibold, marginTop: Spacing.sm },
  signInWrap: { alignItems: 'center', paddingVertical: Spacing.lg, marginTop: Spacing.sm },
  signInText: { color: Colors.textSecondary, fontSize: FontSize.subhead },
  signInLink: { color: Colors.brandBlue, fontWeight: FontWeight.semibold },
  footnote: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 17, paddingHorizontal: Spacing.xl },
});
