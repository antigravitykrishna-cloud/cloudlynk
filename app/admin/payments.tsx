import { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { AdminHeader, Card, Chip, adminStyles, formatDateTime } from '../../components/AdminUI';
import { Colors, FontSize, FontWeight, Radius } from '../../constants/theme';
import { AdminControl, type AdminPayment } from '../../lib/adminControl';

// Every UPI / Razorpay / Sabpaisa payment (v80). Google Play purchases are in
// Play Console, not here.
//
// "Not reported to Google" matters: under user choice billing each of these
// sales has to be reported to Google within 24 hours. The server does it
// automatically and retries; a lasting flag here means it keeps failing
// (usually the Play service account), and needs looking at.

type Filter = 'all' | 'paid' | 'created' | 'failed';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'created', label: 'Unfinished' },
  { key: 'failed', label: 'Failed' },
];
const METHOD: Record<string, string> = { upi: 'UPI', razorpay: 'Razorpay', sabpaisa: 'Sabpaisa' };

export default function AdminPaymentsScreen() {
  const [filter, setFilter] = useState<Filter>('paid');
  const [rows, setRows] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await AdminControl.listPayments(filter === 'all' ? null : filter));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load payments.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const paid = rows.filter(r => r.status === 'paid');
  const total = paid.reduce((s, r) => s + r.amount_inr, 0);

  return (
    <SafeAreaView style={adminStyles.safe} edges={['top']}>
      <AdminHeader title="Payments" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={st.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} style={[st.filter, filter === f.key && st.filterOn]} onPress={() => setFilter(f.key)}>
            <Text style={[st.filterTxt, filter === f.key && st.filterTxtOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {(filter === 'paid' || filter === 'all') && paid.length > 0 && (
        <Text style={[adminStyles.muted, { paddingHorizontal: 16 }]}>
          {paid.length} paid · ₹{total.toLocaleString('en-IN')} in the {rows.length} most recent
        </Text>
      )}
      <FlatList
        data={rows}
        keyExtractor={r => r.id}
        contentContainerStyle={adminStyles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.brandBlue} />}
        ListEmptyComponent={!loading ? <Text style={adminStyles.empty}>{error ?? 'No payments yet.'}</Text> : null}
        renderItem={({ item: r }) => (
          <Card>
            <View style={[adminStyles.row, { justifyContent: 'space-between' }]}>
              <Text style={adminStyles.name}>₹{r.amount_inr} · {r.plan_code}</Text>
              <Chip
                label={r.status === 'paid' ? 'PAID' : r.status === 'failed' ? 'FAILED' : 'UNFINISHED'}
                tone={r.status === 'paid' ? 'good' : r.status === 'failed' ? 'bad' : 'neutral'}
              />
            </View>
            <Text style={adminStyles.muted} numberOfLines={1}>{r.email ?? '(deleted account)'}</Text>
            <Text style={adminStyles.muted}>
              {METHOD[r.method] ?? r.method} · {formatDateTime(r.paid_at ?? r.created_at)}
              {r.provider_payment_id ? ` · ${r.provider_payment_id}` : ''}
            </Text>
            {!!r.failure_reason && <Text style={[adminStyles.muted, { color: Colors.danger }]}>{r.failure_reason}</Text>}
            {r.google_report_needed && !r.google_reported && (
              <Text style={[adminStyles.muted, { color: Colors.warning }]}>Not reported to Google yet — retried automatically.</Text>
            )}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filter: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full },
  filterOn: { backgroundColor: Colors.brandBlue, borderColor: Colors.brandBlue },
  filterTxt: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  filterTxtOn: { color: '#FFFFFF' },
});
