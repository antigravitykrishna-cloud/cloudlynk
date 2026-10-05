import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { useSubscriptionPlans, type SubscriptionPlan } from '../lib/subscriptionService';
import { LoginSheet } from './LoginSheet';
import { PressScale, fireHaptic } from './Press';
import { Icon } from './Icon';

// The Profile tab for someone who is not signed in.
//
// The client's reference flow: the plans ARE the page. Pick one, press Next,
// and only then is sign-in asked for, in a sheet over the plans rather than a
// jump to another screen, so the choice they just made stays in view.
//
// Nothing is bought here: a purchase needs an account to attach the
// entitlement to. Signing in from the sheet remembers the plan
// (lib/postLogin.ts), so the person lands on /premium with it already
// selected, one tap from paying.
//
// The benefits list is deliberately ours, not the reference app's. "2 TB
// storage", "ad-free" and "faster uploads" are not things Cloudlynk Premium
// does, and a store listing that promises what the app does not deliver is a
// Play policy problem as well as a refund problem.

const BENEFITS = [
  'Every premium movie and web series',
  'Premium channels unlocked in your feed',
  'Cancel anytime from Google Play',
];

function durationLabel(days: number): string {
  if (days >= 365) return '1 year';
  if (days >= 180) return '6 months';
  if (days >= 30) return '1 month';
  return `${days} days`;
}

export function GuestPlans({
  onBack,
  initialPlan,
}: {
  /** Shown as a back chevron when this is a pushed screen (/premium), not a tab. */
  onBack?: () => void;
  /** Plan code to start on, e.g. from /premium?plan=gold-1m. */
  initialPlan?: string;
} = {}) {
  const { data: plans, isLoading, isError, refetch } = useSubscriptionPlans();

  // Start on the plan marked popular, else the first -- so Next works
  // without a tap, and the default is the one the business wants to sell.
  const [selectedCode, setSelectedCode] = useDefaultPlan(plans, initialPlan);
  const [sheetOpen, setSheetOpen] = useState(false);

  const selected: SubscriptionPlan | undefined = plans?.find(p => p.code === selectedCode);

  const openSheet = () => {
    fireHaptic('light');
    setSheetOpen(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.largeTitle, { flex: 1 }]}>Premium</Text>
        <TouchableOpacity
          onPress={openSheet}
          style={styles.avatarBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          <Icon name="user" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PlanList
          plans={plans}
          isLoading={isLoading}
          isError={isError}
          refetch={refetch}
          selectedCode={selectedCode}
          onSelect={setSelectedCode}
        />
      </ScrollView>

      <View style={styles.bottomBar}>
        <PressScale
          style={[styles.nextBtn, !selected && { opacity: 0.5 }]}
          onPress={openSheet}
          disabled={!selected}
          accessibilityRole="button"
          accessibilityLabel="Next"
        >
          <Text style={styles.nextText}>Next</Text>
        </PressScale>
      </View>

      <LoginSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        message={selected
          ? `Sign in to get the ${selected.name} plan. It only takes a moment.`
          : undefined}
        returnTo={selected ? { pathname: '/premium', params: { plan: selected.code } } : '/premium'}
      />
    </View>
  );
}

/**
 * The benefits card and the plan radio rows, with no header or button, so a
 * screen can put it wherever it wants: the whole page for a guest
 * (GuestPlans), or the top of Profile for a signed-in member without a plan.
 */
export function PlanList({
  plans, isLoading, isError, refetch, selectedCode, onSelect,
}: {
  plans: SubscriptionPlan[] | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}) {
  const setSelectedCode = onSelect;
  return (
    <>
    <Animated.View entering={FadeInDown.duration(280)} style={styles.benefitsCard}>
      <View style={styles.pill}><Text style={styles.pillText}>Premium</Text></View>
      {BENEFITS.map(b => (
        <View key={b} style={styles.benefitRow}>
          <Icon name="check-circle" size={18} color={Colors.brandBlue} />
          <Text style={styles.benefitText}>{b}</Text>
        </View>
      ))}
    </Animated.View>

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
      plans.map((plan, i) => {
        const isSelected = plan.code === selectedCode;
        return (
          <Animated.View key={plan.code} entering={FadeInDown.delay(60 + i * 50).duration(260)}>
            <PressScale
              style={[styles.planRow, isSelected && styles.planRowSelected]}
              onPress={() => { fireHaptic('selection'); setSelectedCode(plan.code); }}
              scaleTo={0.98}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${plan.name}, ${durationLabel(plan.duration_days)}, ${plan.price_inr} rupees`}
            >
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {plan.is_popular && (
                    <View style={styles.popularTag}>
                      <Text style={styles.popularTagText}>POPULAR</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planDuration}>{durationLabel(plan.duration_days)}</Text>
              </View>
              <Text style={styles.price}>
                <Text style={styles.currency}>₹ </Text>{plan.price_inr}
              </Text>
            </PressScale>
          </Animated.View>
        );
      })
    )}

    <Text style={styles.footnote}>
      Billed through Google Play. A free account includes 15 GB of storage.
    </Text>
    </>
  );
}

/** Starts on the requested plan, else the popular one, else the first. */
export function useDefaultPlan(
  plans: SubscriptionPlan[] | undefined,
  initialPlan?: string,
): [string | null, (code: string) => void] {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  useEffect(() => {
    if (selectedCode || !plans?.length) return;
    setSelectedCode(
      (plans.find(p => p.code === initialPlan) ?? plans.find(p => p.is_popular) ?? plans[0]).code,
    );
  }, [plans, selectedCode, initialPlan]);
  return [selectedCode, setSelectedCode];
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  backBtn: { marginRight: Spacing.sm, marginLeft: -Spacing.xs },
  backChevron: { color: Colors.text, fontSize: 36, lineHeight: 38, fontWeight: FontWeight.regular },
  largeTitle: { color: Colors.text, fontSize: FontSize.xxxl, fontWeight: FontWeight.extrabold, letterSpacing: -0.5 },
  avatarBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  benefitsCard: {
    backgroundColor: Colors.accentOrangeDim, borderRadius: Radius.xl,
    padding: Spacing.lg, marginBottom: Spacing.xl, gap: 12,
  },
  pill: {
    alignSelf: 'flex-start', backgroundColor: Colors.brandBlue,
    borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 2,
  },
  pillText: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: FontWeight.extrabold },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { color: Colors.text, fontSize: FontSize.subhead, fontWeight: FontWeight.semibold, flex: 1 },
  planRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg, marginBottom: 12,
  },
  planRowSelected: { borderColor: Colors.brandBlue, backgroundColor: Colors.accentOrangeDim },
  radio: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.brandBlue },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.brandBlue },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  planName: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  popularTag: { backgroundColor: Colors.brandBlue, borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: 2 },
  popularTagText: { color: '#FFFFFF', fontSize: 9, fontWeight: FontWeight.extrabold, letterSpacing: 0.4 },
  planDuration: { color: Colors.textSecondary, fontSize: FontSize.base, marginTop: 3 },
  price: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.extrabold },
  currency: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  errorBox: { alignItems: 'center', paddingVertical: Spacing.xxl },
  errorText: { color: Colors.textSecondary, fontSize: FontSize.base },
  retry: { color: Colors.brandBlue, fontSize: FontSize.base, fontWeight: FontWeight.semibold, marginTop: Spacing.sm },
  footnote: {
    color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 17,
    paddingHorizontal: Spacing.xl, marginTop: Spacing.sm,
  },
  bottomBar: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, backgroundColor: Colors.bg,
  },
  nextBtn: { backgroundColor: Colors.brandBlue, borderRadius: Radius.lg, paddingVertical: 16, alignItems: 'center' },
  nextText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: FontWeight.bold, letterSpacing: 0.2 },
});
