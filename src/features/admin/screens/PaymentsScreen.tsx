import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { PillTabs } from '@/components/ui/Tabs';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Colors, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatDateTime } from '@/utils/format';
import {
  adminBillingApi,
  type AdminPayment,
  type PaymentStatus,
} from '@/features/admin/api/adminBillingApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';

// UPI / Razorpay / Sabpaisa payments (Google Play purchases are in Play Console). Under user choice
// billing each sale must be reported to Google within 24 hours; the server retries, so a lasting
// "Not reported" means something is wrong (usually the Play service account).

type Filter = PaymentStatus | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'created', label: 'Unfinished' },
  { key: 'failed', label: 'Failed' },
];

const STATUS_CHIP: Record<string, { label: string; tone: ChipTone }> = {
  paid: { label: 'PAID', tone: 'good' },
  failed: { label: 'FAILED', tone: 'bad' },
  created: { label: 'UNFINISHED', tone: 'neutral' },
};

const METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  razorpay: 'Razorpay',
  sabpaisa: 'Sabpaisa',
};

export default function PaymentsScreen() {
  const [filter, setFilter] = useState<Filter>('paid');
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPayments(await adminBillingApi.listPayments(filter === 'all' ? null : filter));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not load payments.'));
    }
  }, [filter]);
  const refreshControl = usePullToRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const paid = payments.filter(payment => payment.status === 'paid');
  const paidTotal = paid.reduce((sum, payment) => sum + payment.amount_inr, 0);

  return (
    <AdminScreen title="Payments">
      <View style={styles.filters}>
        <PillTabs tabs={FILTERS} selected={filter} onSelect={setFilter} />
      </View>
      {paid.length > 0 ? (
        <Text style={[adminStyles.muted, styles.total]}>
          {paid.length} paid · ₹{paidTotal.toLocaleString('en-IN')} in the {payments.length} most
          recent
        </Text>
      ) : null}
      <FlatList
        data={payments}
        keyExtractor={payment => payment.id}
        contentContainerStyle={adminStyles.list}
        refreshControl={refreshControl}
        ListEmptyComponent={<EmptyState icon="chart" title={error ?? 'No payments yet.'} />}
        renderItem={({ item }) => <PaymentCard payment={item} />}
      />
    </AdminScreen>
  );
}

function PaymentCard({ payment }: { payment: AdminPayment }) {
  const chip = STATUS_CHIP[payment.status] ?? STATUS_CHIP.created;
  return (
    <Card>
      <View style={[adminStyles.row, styles.header]}>
        <Text style={adminStyles.name}>
          ₹{payment.amount_inr} · {payment.plan_code}
        </Text>
        <Chip label={chip.label} tone={chip.tone} />
      </View>
      <Text style={adminStyles.muted} numberOfLines={1}>
        {payment.email ?? '(deleted account)'}
      </Text>
      <Text style={adminStyles.muted}>
        {METHOD_LABELS[payment.method] ?? payment.method} ·{' '}
        {formatDateTime(payment.paid_at ?? payment.created_at)}
        {payment.provider_payment_id ? ` · ${payment.provider_payment_id}` : ''}
      </Text>
      {payment.failure_reason ? (
        <Text style={[adminStyles.muted, styles.failed]}>{payment.failure_reason}</Text>
      ) : null}
      {payment.google_report_needed && !payment.google_reported ? (
        <Text style={[adminStyles.muted, styles.unreported]}>
          Not reported to Google yet — retried automatically.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  total: { paddingHorizontal: Spacing.lg },
  header: { justifyContent: 'space-between' },
  failed: { color: Colors.danger },
  unreported: { color: Colors.warning },
});
