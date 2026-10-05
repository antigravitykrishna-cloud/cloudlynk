import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { Colors, FontSize, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatDateTime } from '@/utils/format';
import { adminContentApi, type PostGrantee } from '@/features/admin/api/adminContentApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { GrantAccessForm } from '@/features/admin/components/GrantAccessForm';
import { useAdminAction } from '@/features/admin/hooks/useAdminAction';

// Who can watch one post without a subscription. A grant never changes anyone's plan, and revoking
// one never affects anything they paid for (enforced in the database).

export default function PostAccessScreen() {
  const { postId } = useLocalSearchParams<{ postId?: string }>();
  const [grantees, setGrantees] = useState<PostGrantee[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!postId) return;
    try {
      setGrantees(await adminContentApi.getPostGrantees(postId));
    } catch (err) {
      setGrantees([]);
      showAlert('Could not load who has access', errorMessage(err, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [postId]);
  const actions = useAdminAction(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!postId) {
    return (
      <AdminScreen title="Post Access" fallbackHref="/admin/content">
        <EmptyState icon="lock" title="Open this from a post in Content." />
      </AdminScreen>
    );
  }

  const revoke = (grantee: PostGrantee) =>
    actions.confirm(
      'Revoke access?',
      `${grantee.email} will no longer be able to watch this post. Their subscription, if any, is unaffected.`,
      'Revoke',
      () =>
        actions.run(
          grantee.user_id,
          () => adminContentApi.revokeAccess(grantee.user_id, postId),
          'Access revoked.',
        ),
    );

  return (
    <AdminScreen title="Post Access" fallbackHref="/admin/content">
      <ScrollView contentContainerStyle={adminStyles.list} keyboardShouldPersistTaps="handled">
        <Text style={[adminStyles.muted, styles.intro]}>
          Granting access lets one person watch this post without a subscription. It never changes
          their plan, and revoking it never affects anything they have paid for.
        </Text>
        <GrantAccessForm postId={postId} onGranted={load} />

        <Text style={adminStyles.section}>WHO HAS ACCESS</Text>
        {loading ? (
          <ActivityIndicator color={Colors.brandBlue} size="large" style={styles.loading} />
        ) : grantees.length === 0 ? (
          <Card>
            <Text style={adminStyles.muted}>Nobody has been granted access to this post.</Text>
          </Card>
        ) : (
          grantees.map(grantee => (
            <GranteeCard
              key={grantee.grant_id}
              grantee={grantee}
              revoking={actions.busy === grantee.user_id}
              onRevoke={() => revoke(grantee)}
            />
          ))
        )}
      </ScrollView>
    </AdminScreen>
  );
}

function GranteeCard({
  grantee,
  revoking,
  onRevoke,
}: {
  grantee: PostGrantee;
  revoking: boolean;
  onRevoke: () => void;
}) {
  const active = grantee.status === 'active';
  return (
    <Card>
      <View style={[adminStyles.row, styles.header]}>
        <Text style={[adminStyles.name, styles.flex]} numberOfLines={1}>
          {grantee.full_name || grantee.email}
        </Text>
        <Chip label={grantee.status.toUpperCase()} tone={active ? 'good' : 'neutral'} />
      </View>
      <Text style={adminStyles.muted}>{grantee.email}</Text>
      <Text style={adminStyles.muted}>
        {grantee.expires_at
          ? `Expires ${formatDateTime(grantee.expires_at)}`
          : 'No expiry — until revoked'}
      </Text>
      {grantee.reason ? <Text style={styles.reason}>Reason: {grantee.reason}</Text> : null}
      {grantee.granted_by_email ? (
        <Text style={adminStyles.muted}>Granted by {grantee.granted_by_email}</Text>
      ) : null}
      {active ? (
        <Button
          label="Revoke"
          variant="danger"
          size="sm"
          onPress={onRevoke}
          busy={revoking}
          style={styles.revoke}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: Spacing.md },
  loading: { marginTop: 30 },
  header: { justifyContent: 'space-between' },
  flex: { flex: 1 },
  reason: { color: Colors.gold, fontSize: FontSize.sm, marginTop: Spacing.xs },
  revoke: { marginTop: Spacing.md, alignSelf: 'flex-start' },
});
