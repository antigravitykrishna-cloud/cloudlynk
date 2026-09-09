import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

// "Expired subscribers should be managed separately" (v75). This is that
// screen: the subscriber base split into cohorts, filtered server-side by
// admin_list_subscribers so the expired list stays complete past the row
// limit — the reason it is an RPC and not admin_search_users plus a client
// filter.
//
// Read-only on purpose. Nothing here can change a plan, because nothing
// SHOULD: plan_status is written by verify-play-receipt and
// play-rtdn-webhook from what Google reports, and by the hourly sweeper when
// a term runs out. An admin button that set someone's plan by hand would be
// a fourth writer racing the other three, and the entitlement would be
// overwritten by the next RTDN message anyway. Grants for individual posts
// are the supported way to give someone access without a subscription —
// app/admin/post-access.tsx and the Grants panel in user-approvals.
//
// The `isAdmin` check below is UX only. Both RPCs re-verify is_admin
// server-side; that is the actual boundary.

type Cohort = 'expired' | 'expiring' | 'active' | 'cancelled' | 'free';

type SubscriberRow = {
  id: string;
  email: string;
  full_name: string | null;
  plan_status: string | null;
  plan_started_at: string | null;
  plan_expires_at: string | null;
  account_status: string | null;
  created_at: string;
};

type Counts = {
  active_count: number;
  expiring_count: number;
  expired_count: number;
  cancelled_count: number;
};

const COHORTS: { key: Cohort; label: string; countKey?: keyof Counts }[] = [
  { key: 'expired',   label: 'Expired',   countKey: 'expired_count' },
  { key: 'expiring',  label: 'Ending',    countKey: 'expiring_count' },
  { key: 'active',    label: 'Active',    countKey: 'active_count' },
  { key: 'cancelled', label: 'Cancelled', countKey: 'cancelled_count' },
  { key: 'free',      label: 'Free' },
];

const BLURB: Record<Cohort, string> = {
  expired:   'Subscriptions whose term has run out. Premium access is already gone — the gate reads the date, not this status.',
  expiring:  'Active subscriptions ending within 7 days. Each was sent a reminder 3 days out.',
  active:    'Live subscriptions, including lifetime.',
  cancelled: 'Cancelled but still inside the paid term. Access ends on the date shown, then they move to Expired.',
  free:      'No subscription on record.',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Days until (positive) or since (negative) the date, for the relative label.
function dayDelta(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default function AdminSubscribersScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [cohort, setCohort] = useState<Cohort>('expired');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<SubscriberRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (which: Cohort, search: string) => {
    try {
      const [listRes, countRes] = await Promise.all([
        supabase.rpc('admin_list_subscribers', {
          p_cohort: which,
          p_query: search.trim() ? search.trim() : null,
          p_limit: 200,
        }),
        supabase.rpc('admin_subscriber_counts'),
      ]);
      if (listRes.error) throw listRes.error;
      setRows((listRes.data ?? []) as SubscriberRow[]);
      // A failed count must not blank the list — the tabs just lose their
      // badges.
      if (!countRes.error) setCounts(((countRes.data ?? [])[0] ?? null) as Counts | null);
    } catch (err) {
      if (__DEV__) console.error('AdminSubscribers load error:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(cohort, query);
      // `query` is deliberately not a dependency: refetching on every
      // keystroke would fire an RPC per character. Search runs on submit.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, cohort])
  );

  const selectCohort = (next: Cohort) => {
    if (next === cohort) return;
    setCohort(next);
    setLoading(true);
    load(next, query);
  };

  const runSearch = () => {
    setLoading(true);
    load(cohort, query);
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Admin access required.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
          <Text style={styles.headerBackTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscribers</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {COHORTS.map(c => {
          const n = c.countKey && counts ? counts[c.countKey] : null;
          const active = cohort === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.filterTab, active && styles.filterTabActive]}
              onPress={() => selectCohort(c.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                {c.label}{n !== null ? ` (${n})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.blurb}>{BLURB[cohort]}</Text>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          returnKeyType="search"
          placeholder="Search name or email"
          placeholderTextColor="#6B7C97"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={runSearch} activeOpacity={0.7}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#2E7DFF" style={{ marginTop: 60 }} />
      ) : rows.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {query.trim() ? 'Nobody matches that search in this group.' : 'Nobody in this group.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {rows.map(row => {
            const delta = dayDelta(row.plan_expires_at);
            // The sweeper runs hourly, so a row can sit at 'active' with a
            // date already past. Say what is true — access is gone — rather
            // than echoing a status the gate no longer honours.
            const lapsedButUnswept = row.plan_status === 'active' && delta !== null && delta <= 0;

            let dateLabel = '—';
            if (row.plan_expires_at) {
              if (delta === null) dateLabel = formatDate(row.plan_expires_at);
              else if (delta > 0) dateLabel = `Ends ${formatDate(row.plan_expires_at)} · in ${delta}d`;
              else if (delta === 0) dateLabel = `Ends today · ${formatDate(row.plan_expires_at)}`;
              else dateLabel = `Ended ${formatDate(row.plan_expires_at)} · ${Math.abs(delta)}d ago`;
            } else if (row.plan_status === 'lifetime') {
              dateLabel = 'No end date · lifetime';
            }

            return (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.nameText} numberOfLines={1}>
                    {row.full_name?.trim() || row.email}
                  </Text>
                  <Text style={styles.cardDate}>{row.plan_status ?? 'free'}</Text>
                </View>

                {!!row.full_name?.trim() && (
                  <Text style={styles.metaText} numberOfLines={1}>{row.email}</Text>
                )}

                <Text style={styles.metaText}>{dateLabel}</Text>

                {row.plan_started_at && (
                  <Text style={styles.metaText}>Started {formatDate(row.plan_started_at)}</Text>
                )}

                {lapsedButUnswept && (
                  <Text style={styles.warnText}>
                    Term has ended — access already revoked. Status updates on the next hourly sweep.
                  </Text>
                )}

                {row.account_status && row.account_status !== 'active' && (
                  <Text style={styles.warnText}>
                    Account {row.account_status} — content hidden regardless of plan.
                  </Text>
                )}
              </View>
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B1220' },
  header: {
    backgroundColor: '#0B1220',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#22304A',
  },
  headerBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { color: '#2E7DFF', fontSize: 28, fontWeight: '700', lineHeight: 28 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  blurb: {
    color: '#9FB0C9', fontSize: 12, fontWeight: '500', lineHeight: 18,
    paddingHorizontal: 16, paddingBottom: 4,
  },
  filterScroll: { flexGrow: 0 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterTab: { backgroundColor: '#182437', borderWidth: 1, borderColor: '#22304A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  filterTabActive: { backgroundColor: '#2E7DFF', borderColor: '#2E7DFF' },
  filterTabText: { color: '#9FB0C9', fontSize: 12, fontWeight: '700' },
  filterTabTextActive: { color: '#FFFFFF' },
  searchWrap: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  searchInput: {
    flex: 1, backgroundColor: '#182437', borderRadius: 8, borderWidth: 1, borderColor: '#22304A',
    color: '#FFFFFF', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchBtn: { backgroundColor: '#22304A', paddingHorizontal: 16, justifyContent: 'center', borderRadius: 8 },
  searchBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  list: { paddingBottom: 12, paddingHorizontal: 16 },
  card: { backgroundColor: '#182437', borderRadius: 12, borderWidth: 1, borderColor: '#22304A', padding: 16, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 10 },
  nameText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', flex: 1 },
  cardDate: { fontSize: 11, color: '#6B7C97', fontWeight: '700', textTransform: 'uppercase' },
  metaText: { fontSize: 13, color: '#9FB0C9', fontWeight: '500', marginBottom: 2 },
  warnText: { fontSize: 12, color: '#FFC65C', fontWeight: '600', marginTop: 6, lineHeight: 17 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, color: '#9FB0C9', fontWeight: '600', textAlign: 'center' },
});
