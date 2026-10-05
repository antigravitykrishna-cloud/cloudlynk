import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { formatDate } from '@/utils/format';
import type { SubscriptionStatus } from '@/features/premium/api/subscriptionApi';
import { useMySubscription } from '@/features/premium/hooks/useMySubscription';
import { isPlanActive, isPlanAwaitingExpiry } from '@/features/premium/planStatus';

// The signed-in person's plan, and their latest manual payment request if they ever made one.

const PLAN_TONES: Record<string, ChipTone> = {
  active: 'good',
  lifetime: 'good',
  pending: 'warn',
  expired: 'bad',
  cancelled: 'bad',
};

const REQUEST_TONES: Record<string, ChipTone> = {
  approved: 'good',
  pending: 'warn',
  rejected: 'bad',
};

export default function MySubscriptionScreen() {
  const router = useRouter();
  const { status, loading } = useMySubscription();
  const active = isPlanActive(status);

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScreenHeader title="My Subscription" fallbackHref="/(tabs)/profile" />
      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} size="large" style={styles.loading} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <CurrentPlanCard status={status} />
          <LatestRequestCard status={status} />
          <Button
            label={active ? 'Plan Active' : 'Upgrade'}
            size="lg"
            onPress={() => router.push('/premium')}
            disabled={active}
            style={styles.upgrade}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CurrentPlanCard({ status }: { status: SubscriptionStatus | null }) {
  const planStatus = status?.plan_status ?? 'free';
  const active = isPlanActive(status);
  // A plan past its end date can still read 'active' until the hourly expiry job runs. One
  // derived status drives both the label and the colour, so a green chip never reads EXPIRED.
  const lapsed = isPlanAwaitingExpiry(status);
  const shownStatus = lapsed ? 'expired' : planStatus;

  return (
    <Card>
      <Text style={styles.cardTitle}>Current Plan</Text>
      <Chip label={shownStatus.toUpperCase()} tone={PLAN_TONES[shownStatus] ?? 'neutral'} />
      {active && status?.plan_expires_at ? (
        <Text style={styles.line}>Active until {formatDate(status.plan_expires_at)}</Text>
      ) : null}
      {active && status?.plan_started_at ? (
        <Text style={styles.subLine}>Started {formatDate(status.plan_started_at)}</Text>
      ) : null}
      {planStatus === 'lifetime' ? (
        <Text style={styles.line}>Lifetime access. Nothing to renew.</Text>
      ) : null}
      {!active && planStatus === 'free' ? (
        <Text style={styles.line}>You are on the free plan.</Text>
      ) : null}
      {shownStatus === 'expired' ? (
        <Text style={styles.line}>Your plan expired on {formatDate(status?.plan_expires_at)}.</Text>
      ) : null}
    </Card>
  );
}

function LatestRequestCard({ status }: { status: SubscriptionStatus | null }) {
  if (!status?.latest_request_id) {
    return (
      <Card>
        <Text style={styles.cardTitle}>Latest Request</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No subscription requests yet.</Text>
          <Text style={styles.subLine}>Tap Upgrade to get started.</Text>
        </View>
      </Card>
    );
  }

  const requestStatus = status.latest_request_status ?? '';
  const amount = status.latest_request_amount_inr ? ` · ₹${status.latest_request_amount_inr}` : '';

  return (
    <Card>
      <Text style={styles.cardTitle}>Latest Request</Text>
      <View style={styles.requestRow}>
        <Text style={styles.requestPlan}>
          {(status.latest_request_plan_code ?? '').toUpperCase()}
          {amount}
        </Text>
        <Chip
          label={requestStatus.toUpperCase()}
          tone={REQUEST_TONES[requestStatus] ?? 'neutral'}
        />
      </View>
      <Text style={styles.subLine}>Submitted {formatDate(status.latest_request_created_at)}</Text>
      {requestStatus === 'approved' && status.latest_request_reviewed_at ? (
        <Text style={[styles.subLine, styles.approved]}>
          Approved on {formatDate(status.latest_request_reviewed_at)}
        </Text>
      ) : null}
      {requestStatus === 'rejected' ? (
        <Text style={[styles.subLine, styles.rejected]}>
          Rejected: {status.latest_request_rejection_reason ?? 'Payment not verified'}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  loading: { marginTop: 60 },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  cardTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  line: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: FontWeight.medium,
    marginTop: Spacing.sm,
  },
  subLine: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    marginTop: Spacing.xs,
  },
  approved: { color: Colors.success },
  rejected: { color: Colors.danger },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  requestPlan: { fontSize: FontSize.subhead, fontWeight: FontWeight.bold, color: Colors.text },
  empty: { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text },
  upgrade: { marginTop: Spacing.sm },
});
