import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { PillTabs } from '@/components/ui/Tabs';
import { TextField } from '@/components/ui/TextField';
import { Colors, FontSize, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatDate, formatDateTime } from '@/utils/format';
import {
  adminUsersApi,
  type ApprovalRow,
  type ApprovalStatus,
} from '@/features/admin/api/adminUsersApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { UserGrantsPanel } from '@/features/admin/components/UserGrantsPanel';

// Account approval: who may reach the subscribe flow. It unlocks no content, and rejecting never
// affects a subscription someone already paid for. Guest IDs are not listed (they save first).

const FILTERS: { key: ApprovalStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function UserApprovalsScreen() {
  const [filter, setFilter] = useState<ApprovalStatus>('pending');
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      adminUsersApi
        .listByApproval(filter)
        .then(setRows)
        // An empty queue after a failed load would read as "nothing to review".
        .catch(err =>
          showAlert('Could not load accounts', errorMessage(err, 'Check your connection.')),
        )
        .finally(() => setLoading(false));
    }, [filter]),
  );

  const removeRow = (userId: string) => setRows(list => list.filter(row => row.id !== userId));

  return (
    <AdminScreen title="User Approvals">
      <Text style={[adminStyles.muted, styles.blurb]}>
        Approving an account lets it reach the subscribe flow. It does not unlock content, and
        rejecting never affects a subscription someone has already paid for.
      </Text>
      <View style={styles.filters}>
        <PillTabs tabs={FILTERS} selected={filter} onSelect={setFilter} />
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} size="large" style={styles.loading} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={row => row.id}
          contentContainerStyle={adminStyles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="check-circle"
              title={
                filter === 'pending' ? 'No accounts waiting for review' : `No ${filter} accounts`
              }
            />
          }
          renderItem={({ item }) => <ApprovalCard row={item} onDecided={removeRow} />}
        />
      )}
    </AdminScreen>
  );
}

function ApprovalCard({ row, onDecided }: { row: ApprovalRow; onDecided: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [showGrants, setShowGrants] = useState(false);

  async function decide(status: 'approved' | 'rejected', reviewNote?: string) {
    setBusy(true);
    try {
      await adminUsersApi.setApproval(row.id, status, reviewNote);
      onDecided(row.id);
    } catch (err) {
      showAlert('Could not update this account', errorMessage(err, 'Please try again.'));
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={adminStyles.row}>
        <Text style={[adminStyles.name, styles.flex]} numberOfLines={1}>
          {row.full_name || row.username || '—'}
        </Text>
        <Text style={styles.date}>{formatDate(row.created_at)}</Text>
      </View>
      <Text style={adminStyles.muted} numberOfLines={1}>
        {row.email}
      </Text>
      <Text style={adminStyles.muted}>Signed up {formatDateTime(row.created_at)}</Text>
      {row.approval_reviewed_at ? (
        <Text style={adminStyles.muted}>Reviewed {formatDateTime(row.approval_reviewed_at)}</Text>
      ) : null}
      {row.approval_note ? <Text style={styles.note}>Note: {row.approval_note}</Text> : null}

      {rejecting ? (
        <View style={styles.rejectForm}>
          <TextField
            value={note}
            onChangeText={setNote}
            placeholder="Why is this account being rejected? (required)"
            multiline
          />
          <View style={adminStyles.row}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setRejecting(false)}
              style={styles.flex}
            />
            <Button
              label="Confirm reject"
              variant="danger"
              onPress={() => decide('rejected', note.trim())}
              busy={busy}
              disabled={!note.trim()}
              style={styles.flex}
            />
          </View>
        </View>
      ) : (
        <View style={adminStyles.actions}>
          {row.approval_status !== 'approved' ? (
            <Button
              label="Approve"
              variant="success"
              size="sm"
              onPress={() => decide('approved')}
              busy={busy}
            />
          ) : null}
          {row.approval_status !== 'rejected' ? (
            <Button
              label="Reject"
              variant="danger"
              size="sm"
              onPress={() => setRejecting(true)}
              disabled={busy}
            />
          ) : null}
          <Button
            label={showGrants ? 'Hide grants' : 'Grants'}
            variant="secondary"
            size="sm"
            onPress={() => setShowGrants(shown => !shown)}
          />
        </View>
      )}
      {showGrants ? <UserGrantsPanel userId={row.id} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  blurb: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  filters: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  loading: { marginTop: 60 },
  flex: { flex: 1 },
  date: { color: Colors.textMuted, fontSize: FontSize.xs },
  note: { color: Colors.gold, fontSize: FontSize.sm, marginTop: 6 },
  rejectForm: { marginTop: Spacing.md },
});
