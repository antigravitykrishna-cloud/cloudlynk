import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Colors, Spacing } from '@/theme';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { PendingPostCard } from '@/features/admin/components/PendingItems';
import { useReviewQueue } from '@/features/admin/hooks/useReviewQueue';

// New posts waiting for review. Rejecting here asks for a reason, which the author sees.

export default function PendingChannelContentScreen() {
  const queue = useReviewQueue();
  const refreshControl = usePullToRefresh(queue.reload);
  const [rejecting, setRejecting] = useState<string | null>(null);

  return (
    <AdminScreen title="Pending Content">
      {queue.loading ? (
        <ActivityIndicator color={Colors.brandBlue} size="large" style={styles.loading} />
      ) : (
        <FlatList
          data={queue.posts}
          keyExtractor={post => post.id}
          contentContainerStyle={adminStyles.list}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState icon="check-circle" title="No pending content" />}
          renderItem={({ item: post }) => (
            <View>
              <PendingPostCard post={post} queue={queue} onReject={() => setRejecting(post.id)} />
              {rejecting === post.id ? (
                <RejectWithReason
                  onCancel={() => setRejecting(null)}
                  onConfirm={async reason => {
                    await queue.rejectPost(post, reason);
                    setRejecting(null);
                  }}
                />
              ) : null}
            </View>
          )}
        />
      )}
    </AdminScreen>
  );
}

function RejectWithReason({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const confirm = () => {
    if (!reason.trim()) {
      showAlert('Reason required', 'Please enter a reason for rejection.');
      return;
    }
    onConfirm(reason.trim());
  };
  return (
    <View style={styles.rejectForm}>
      <TextField
        value={reason}
        onChangeText={setReason}
        placeholder="Reason for rejection..."
        multiline
        autoFocus
      />
      <View style={adminStyles.row}>
        <Button label="Cancel" variant="secondary" onPress={onCancel} style={styles.flex} />
        <Button label="Confirm Reject" variant="danger" onPress={confirm} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 60 },
  rejectForm: { marginTop: -Spacing.xs, marginBottom: Spacing.md },
  flex: { flex: 1 },
});
