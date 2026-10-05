import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { PillTabs } from '@/components/ui/Tabs';
import { Colors, FontSize, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatDateTime } from '@/utils/format';
import { adminContentApi, type AuditEntry } from '@/features/admin/api/adminContentApi';
import { auditActionChip, describeAuditDetail } from '@/features/admin/auditLog';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';

// Every admin action, newest first. admin_audit_log has no read policies at all; it is readable
// only through admin_list_audit_log, which checks admin rights itself.

type Filter = 'all' | 'post' | 'user';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'post', label: 'Posts' },
  { key: 'user', label: 'Users' },
];

const PAGE_SIZE = 100;

export default function AuditLogScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      adminContentApi
        .listAuditLog(PAGE_SIZE, filter === 'all' ? undefined : filter)
        .then(setEntries)
        .catch(err => {
          setEntries([]);
          showAlert('Could not load the audit log', errorMessage(err, 'Check your connection.'));
        })
        .finally(() => setLoading(false));
    }, [filter]),
  );

  return (
    <AdminScreen title="Audit Log">
      <View style={styles.filters}>
        <PillTabs tabs={FILTERS} selected={filter} onSelect={setFilter} />
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} size="large" style={styles.loading} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={entry => entry.id}
          contentContainerStyle={adminStyles.list}
          ListEmptyComponent={<EmptyState icon="history" title="Nothing logged yet" />}
          renderItem={({ item }) => <AuditEntryCard entry={item} />}
        />
      )}
    </AdminScreen>
  );
}

function AuditEntryCard({ entry }: { entry: AuditEntry }) {
  const chip = auditActionChip(entry.action);
  const detail = describeAuditDetail(entry);
  return (
    <Card>
      <View style={[adminStyles.row, styles.header]}>
        <Chip label={chip.label} tone={chip.tone} />
        <Text style={styles.date}>{formatDateTime(entry.created_at)}</Text>
      </View>
      <Text style={adminStyles.muted}>
        by {entry.admin_name || entry.admin_email || 'Unknown admin'}
      </Text>
      <Text style={adminStyles.muted}>
        {entry.target_type}
        {entry.target_id ? ` · ${entry.target_id.slice(0, 8)}…` : ''}
      </Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  loading: { marginTop: 60 },
  header: { justifyContent: 'space-between', marginBottom: Spacing.xs },
  date: { color: Colors.textMuted, fontSize: FontSize.xs },
  detail: { color: Colors.text, fontSize: FontSize.md, marginTop: Spacing.xs },
});
