import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { fireHaptic } from '@/components/ui/Press';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { LoginSheet } from '@/features/auth/components/LoginSheet';
import { PlanPicker } from '@/features/premium/components/PlanPicker';
import {
  useSelectedPlan,
  useSubscriptionPlans,
} from '@/features/premium/hooks/useSubscriptionPlans';

// What a signed-out visitor sees on the Profile tab and on /premium: the plans are the page. Pick
// one and press Next; sign-in is asked for in a sheet over the plans, and the chosen plan is
// remembered so they land on /premium ready to pay.

export function GuestPlans({
  onBack,
  initialPlan,
}: {
  /** Shows a back chevron, for when this is a pushed screen (/premium) rather than a tab. */
  onBack?: () => void;
  /** Plan code to start on, e.g. from /premium?plan=gold-1m. */
  initialPlan?: string;
}) {
  const { data: plans } = useSubscriptionPlans();
  const { selectedCode, selectedPlan, select } = useSelectedPlan(plans, initialPlan);
  const [signingIn, setSigningIn] = useState(false);

  const askToSignIn = () => {
    fireHaptic('light');
    setSigningIn(true);
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.back}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.chevron}>‹</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.title}>Premium</Text>
        <TouchableOpacity
          onPress={askToSignIn}
          style={styles.signIn}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          <Icon name="user" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PlanPicker selectedCode={selectedCode} onSelect={select} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <Button label="Next" size="lg" onPress={askToSignIn} disabled={!selectedPlan} />
      </View>

      <LoginSheet
        visible={signingIn}
        onClose={() => setSigningIn(false)}
        message={
          selectedPlan
            ? `Sign in to get the ${selectedPlan.name} plan. It only takes a moment.`
            : undefined
        }
        returnTo={
          selectedPlan ? { pathname: '/premium', params: { plan: selectedPlan.code } } : '/premium'
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  back: { marginRight: Spacing.sm, marginLeft: -Spacing.xs },
  chevron: { color: Colors.text, fontSize: 36, lineHeight: 38, fontWeight: FontWeight.regular },
  title: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.extrabold,
    letterSpacing: -0.5,
  },
  signIn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  bottomBar: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
});
