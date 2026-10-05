import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AdminHeader, Card, Chip, adminStyles, formatDate, planChip } from '../../components/AdminUI';
import { PressScale } from '../../components/Press';
import { Colors } from '../../constants/theme';
import { AdminControl, type AdminUserSummary } from '../../lib/adminControl';
import { useAuth } from '../../hooks/useAuth';

// Every account, searchable by email or name. Tap one for the controls:
// premium, admin rights, uploads, suspend/ban, approval (app/admin/user/[id]).

export default function AdminUsersScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      setRows(await AdminControl.searchUsers(q, 100));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Search as they type, lightly debounced.
  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, isAdmin, load]);

  return (
    <SafeAreaView style={adminStyles.safe} edges={['top']}>
      <AdminHeader title="Users" />
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <TextInput
          style={adminStyles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by email or name"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={u => u.id}
        contentContainerStyle={adminStyles.list}
        refreshControl={<RefreshControl refreshing={loading && rows.length > 0} onRefresh={() => load(query)} tintColor={Colors.brandBlue} />}
        ListEmptyComponent={!loading ? <Text style={adminStyles.empty}>{error ?? 'No users match.'}</Text> : null}
        renderItem={({ item: u }) => (
          <PressScale onPress={() => router.push(`/admin/user/${u.id}` as never)}>
            <Card>
              <Text style={adminStyles.name} numberOfLines={1}>{u.full_name?.trim() || u.email}</Text>
              {!!u.full_name?.trim() && <Text style={adminStyles.muted} numberOfLines={1}>{u.email}</Text>}
              <View style={[adminStyles.row, { marginTop: 8, flexWrap: 'wrap' }]}>
                {planChip(u)}
                {u.account_status && u.account_status !== 'active' && (
                  <Chip label={u.account_status.toUpperCase()} tone="bad" />
                )}
                {u.approval_status && u.approval_status !== 'approved' && (
                  <Chip label={`APPROVAL ${u.approval_status.toUpperCase()}`} tone="warn" />
                )}
                <Text style={[adminStyles.muted, { marginLeft: 'auto' }]}>Joined {formatDate(u.created_at)}</Text>
              </View>
            </Card>
          </PressScale>
        )}
      />
    </SafeAreaView>
  );
}
