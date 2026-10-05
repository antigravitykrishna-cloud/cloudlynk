import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { PressScale } from '@/components/ui/Press';
import { SearchBar } from '@/components/ui/SearchBar';
import { PillTabs } from '@/components/ui/Tabs';
import { Colors, FontSize, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatDate } from '@/utils/format';
import {
  adminUsersApi,
  type SubscriberCohort,
  type SubscriberCounts,
  type SubscriberRow,
} from '@/features/admin/api/adminUsersApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { isLapsedButUnswept, termLabel } from '@/features/admin/subscriptionTerm';

// Subscribers by where they are in their term. Tap one for the account's controls.

const COHORTS: { key: SubscriberCohort; label: string; count?: keyof SubscriberCounts }[] = [
  { key: 'expired', label: 'Expired', count: 'expired_count' },
  { key: 'expiring', label: 'Ending', count: 'expiring_count' },
  { key: 'active', label: 'Active', count: 'active_count' },
  { key: 'cancelled', label: 'Cancelled', count: 'cancelled_count' },
  { key: 'free', label: 'Free' },
];

const DESCRIPTIONS: Record<SubscriberCohort, string> = {
  expired:
    'Subscriptions whose term has run out. Premium access is already gone — the gate reads the date, not this status.',
  expiring: 'Active subscriptions ending within 7 days. Each was sent a reminder 3 days out.',
  active: 'Live subscriptions, including lifetime.',
  cancelled:
    'Cancelled but still inside the paid term. Access ends on the date shown, then they move to Expired.',
  free: 'No subscription on record.',
};

const SEARCH_DEBOUNCE_MS = 400;

export default function SubscribersScreen() {
  const router = useRouter();
  const [cohort, setCohort] = useState<SubscriberCohort>('expired');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<SubscriberRow[]>([]);
  const [counts, setCounts] = useState<SubscriberCounts | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setRows(await adminUsersApi.listSubscribers(cohort, query));
    } catch (err) {
      setRows([]);
      showAlert('Could not load subscribers', errorMessage(err, 'Check your connection.'));
    } finally {
      setLoading(false);
    }
    // A failed count only costs the tabs their numbers, never the list.
    adminUsersApi
      .subscriberCounts()
      .then(setCounts)
      .catch(() => {});
  }, [cohort, query]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      const timer = setTimeout(load, query ? SEARCH_DEBOUNCE_MS : 0);
      return () => clearTimeout(timer);
    }, [load, query]),
  );

  const tabs = COHORTS.map(option => ({
    key: option.key,
    label: option.count && counts ? `${option.label} (${counts[option.count]})` : option.label,
  }));

  return (
    <AdminScreen title="Subscribers">
      <View style={styles.controls}>
        <PillTabs tabs={tabs} selected={cohort} onSelect={setCohort} />
        <Text style={adminStyles.muted}>{DESCRIPTIONS[cohort]}</Text>
        <SearchBar value={query} onChange={setQuery} placeholder="Search name or email" />
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} style={styles.loading} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={row => row.id}
          contentContainerStyle={adminStyles.list}
          ListEmptyComponent={
            <EmptyState
              icon="diamond"
              title={
                query.trim() ? 'Nobody matches that search in this group.' : 'Nobody in this group.'
              }
            />
          }
          renderItem={({ item }) => (
            <PressScale
              onPress={() => router.push({ pathname: '/admin/user/[id]', params: { id: item.id } })}
            >
              <SubscriberCard row={item} />
            </PressScale>
          )}
        />
      )}
    </AdminScreen>
  );
}

function SubscriberCard({ row }: { row: SubscriberRow }) {
  const name = row.full_name?.trim();
  return (
    <Card>
      <View style={adminStyles.row}>
        <Text style={[adminStyles.name, styles.flex]} numberOfLines={1}>
          {name || row.email}
        </Text>
        <Text style={styles.status}>{row.plan_status ?? 'free'}</Text>
      </View>
      {name ? (
        <Text style={adminStyles.muted} numberOfLines={1}>
          {row.email}
        </Text>
      ) : null}
      <Text style={adminStyles.muted}>{termLabel(row.plan_status, row.plan_expires_at)}</Text>
      {row.plan_started_at ? (
        <Text style={adminStyles.muted}>Started {formatDate(row.plan_started_at)}</Text>
      ) : null}
      {isLapsedButUnswept(row.plan_status, row.plan_expires_at) ? (
        <Text style={styles.warning}>
          Term has ended — access already revoked. Status updates on the next hourly sweep.
        </Text>
      ) : null}
      {row.account_status && row.account_status !== 'active' ? (
        <Text style={styles.warning}>
          Account {row.account_status} — content hidden regardless of plan.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  controls: { padding: Spacing.lg, paddingBottom: 0, gap: Spacing.md },
  loading: { marginTop: 60 },
  flex: { flex: 1 },
  status: { color: Colors.textMuted, fontSize: FontSize.xs },
  warning: { color: Colors.warning, fontSize: FontSize.sm, marginTop: Spacing.xs },
});
