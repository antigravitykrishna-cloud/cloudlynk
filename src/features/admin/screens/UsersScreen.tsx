import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { PressScale } from '@/components/ui/Press';
import { SearchBar } from '@/components/ui/SearchBar';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatDate } from '@/utils/format';
import { adminUsersApi, type AdminUserSummary } from '@/features/admin/api/adminUsersApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { PlanChip } from '@/features/admin/components/PlanChip';

// Every account, searchable by email or name. Tap one for its controls (UserDetailScreen).

const SEARCH_DEBOUNCE_MS = 300;

export default function UsersScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await adminUsersApi.search(query, 100));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not load users.'));
    }
  }, [query]);
  const refreshControl = usePullToRefresh(load);

  useEffect(() => {
    const timer = setTimeout(load, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <AdminScreen title="Users">
      <View style={styles.search}>
        <SearchBar value={query} onChange={setQuery} placeholder="Search by email or name" />
      </View>
      <FlatList
        data={users}
        keyExtractor={user => user.id}
        contentContainerStyle={adminStyles.list}
        refreshControl={refreshControl}
        ListEmptyComponent={<EmptyState icon="user" title={error ?? 'No users match.'} />}
        renderItem={({ item }) => (
          <PressScale
            onPress={() => router.push({ pathname: '/admin/user/[id]', params: { id: item.id } })}
          >
            <UserCard user={item} />
          </PressScale>
        )}
      />
    </AdminScreen>
  );
}

function UserCard({ user }: { user: AdminUserSummary }) {
  const name = user.full_name?.trim();
  return (
    <Card>
      <Text style={adminStyles.name} numberOfLines={1}>
        {name || user.email}
      </Text>
      {name ? (
        <Text style={adminStyles.muted} numberOfLines={1}>
          {user.email}
        </Text>
      ) : null}
      <View style={[adminStyles.row, styles.chips]}>
        <PlanChip plan={user} />
        {user.account_status && user.account_status !== 'active' ? (
          <Chip label={user.account_status.toUpperCase()} tone="bad" />
        ) : null}
        {user.approval_status && user.approval_status !== 'approved' ? (
          <Chip label={`APPROVAL ${user.approval_status.toUpperCase()}`} tone="warn" />
        ) : null}
        <Text style={[adminStyles.muted, styles.joined]}>Joined {formatDate(user.created_at)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  chips: { marginTop: Spacing.sm, flexWrap: 'wrap' },
  joined: { marginLeft: 'auto' },
});
