import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { showAlert } from '@/components/ui/Feedback';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatDate } from '@/utils/format';
import { adminContentApi } from '@/features/admin/api/adminContentApi';
import { adminUsersApi, type UserGrant } from '@/features/admin/api/adminUsersApi';

/**
 * What one person can watch through admin grants, with Revoke. The other direction -- who can
 * watch one post -- is the Post Access screen. A subscription is never affected.
 */
export function UserGrantsPanel({ userId }: { userId: string }) {
  const [grants, setGrants] = useState<UserGrant[] | null>(null);

  useEffect(() => {
    adminUsersApi
      .listGrants(userId)
      .then(setGrants)
      .catch(err => {
        showAlert('Could not load grants', errorMessage(err, 'Please try again.'));
        setGrants([]);
      });
  }, [userId]);

  const revoke = (grant: UserGrant) =>
    showAlert(
      'Revoke access?',
      `This person will no longer be able to watch "${grant.post_title ?? 'this post'}". Their subscription, if any, is unaffected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminContentApi.revokeAccess(userId, grant.post_id);
              setGrants(await adminUsersApi.listGrants(userId));
            } catch (err) {
              showAlert('Could not revoke access', errorMessage(err, 'Please try again.'));
            }
          },
        },
      ],
    );

  if (!grants) return <ActivityIndicator color={Colors.brandBlue} style={styles.loading} />;
  if (grants.length === 0) return <Text style={styles.meta}>No content grants.</Text>;

  return (
    <View style={styles.panel}>
      {grants.map(grant => (
        <View key={grant.grant_id} style={styles.row}>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {grant.post_title ?? 'Untitled post'}
            </Text>
            <Text style={styles.meta}>
              {grant.status === 'active' ? 'Active' : 'Revoked'} ·{' '}
              {grant.expires_at ? `expires ${formatDate(grant.expires_at)}` : 'until revoked'}
            </Text>
          </View>
          {grant.status === 'active' ? (
            <Button label="Revoke" variant="danger" size="sm" onPress={() => revoke(grant)} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: Spacing.sm },
  panel: { marginTop: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  text: { flex: 1 },
  title: { color: Colors.text, fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  meta: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
});
