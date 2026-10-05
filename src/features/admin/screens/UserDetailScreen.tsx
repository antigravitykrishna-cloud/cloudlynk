import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Colors } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatDate } from '@/utils/format';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  adminUsersApi,
  type AdminUserDetail,
  type PlanAction,
} from '@/features/admin/api/adminUsersApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { PlanChip } from '@/features/admin/components/PlanChip';
import { useAdminAction } from '@/features/admin/hooks/useAdminAction';

// One account, every control: Premium, approval, uploads, admin rights, suspension. Each action
// asks first, runs one audited RPC, then reloads.

const QUICK_DAYS = [7, 30, 180, 365];
const MAX_DAYS = 3650;

type Section = {
  user: AdminUserDetail;
  isMe: boolean;
  actions: ReturnType<typeof useAdminAction>;
};

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me } = useAuth();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setUser(await adminUsersApi.get(id));
    } catch (err) {
      showAlert('Could not load this user', errorMessage(err, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [id]);
  const actions = useAdminAction(load);
  const refreshControl = usePullToRefresh(load);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) {
    return (
      <AdminScreen title="User" fallbackHref="/admin/users">
        {loading ? (
          <ActivityIndicator color={Colors.brandBlue} style={styles.loading} />
        ) : (
          <EmptyState icon="user" title="User not found." />
        )}
      </AdminScreen>
    );
  }

  const section: Section = { user, isMe: user.id === me?.id, actions };
  return (
    <AdminScreen title={user.full_name?.trim() || 'User'} fallbackHref="/admin/users">
      <ScrollView contentContainerStyle={adminStyles.list} refreshControl={refreshControl}>
        <Summary user={user} />
        <Text style={adminStyles.section}>PREMIUM</Text>
        <PremiumControls {...section} />
        <Text style={adminStyles.section}>ACCESS</Text>
        <AccessControls {...section} />
        <Text style={adminStyles.section}>ACCOUNT STATUS</Text>
        <StatusControls {...section} />
      </ScrollView>
    </AdminScreen>
  );
}

function Summary({ user }: { user: AdminUserDetail }) {
  return (
    <Card>
      <Text style={adminStyles.name}>{user.full_name?.trim() || 'No name'}</Text>
      <Text style={adminStyles.muted} selectable>
        {user.email}
      </Text>
      <View style={[adminStyles.row, styles.chips]}>
        <PlanChip plan={user} />
        {user.is_admin ? <Chip label="ADMIN" tone="brand" /> : null}
        {user.can_upload_content ? <Chip label="CAN UPLOAD" tone="brand" /> : null}
        <Chip
          label={(user.account_status ?? 'active').toUpperCase()}
          tone={user.account_status === 'active' ? 'good' : 'bad'}
        />
        <Chip
          label={`APPROVAL ${(user.approval_status ?? 'approved').toUpperCase()}`}
          tone={!user.approval_status || user.approval_status === 'approved' ? 'good' : 'warn'}
        />
      </View>
      <Text style={[adminStyles.muted, styles.spaced]}>
        Joined {formatDate(user.created_at)} · {user.channels_joined} channels joined ·{' '}
        {user.channels_owned} owned · {user.posts} posts · {user.payments_paid} payments
        {user.last_payment_at ? ` (last ${formatDate(user.last_payment_at)})` : ''}
      </Text>
    </Card>
  );
}

function PremiumControls({ user, actions }: Section) {
  const [days, setDays] = useState('30');
  const dayCount = Math.max(0, Math.min(MAX_DAYS, parseInt(days, 10) || 0));
  const setPlan = (plan: PlanAction, done: string) =>
    actions.run(`plan-${plan.action}`, () => adminUsersApi.setPlan(user.id, plan), done);
  const addDays = (count: number) =>
    setPlan({ action: 'add_days', days: count }, `Added ${count} days of Premium.`);

  const summary =
    user.plan_status === 'lifetime'
      ? 'Lifetime Premium.'
      : user.plan_active
        ? `Premium until ${formatDate(user.plan_expires_at)}.`
        : 'No active Premium.';

  return (
    <Card>
      <Text style={adminStyles.muted}>
        {summary} Adding days extends from the current end date if the plan is still running. A
        Google Play subscription can later be updated by Google&apos;s own renewals.
      </Text>
      <View style={adminStyles.actions}>
        {QUICK_DAYS.map(count => (
          <Button
            key={count}
            label={`+${count}d`}
            variant="secondary"
            size="sm"
            disabled={!!actions.busy}
            onPress={() => addDays(count)}
          />
        ))}
      </View>
      <View style={[adminStyles.row, styles.spaced]}>
        <View style={styles.flex}>
          <TextField
            value={days}
            onChangeText={text => setDays(text.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="Days"
            maxLength={4}
          />
        </View>
        <Button
          label={`Add ${dayCount || ''} days`}
          disabled={dayCount < 1}
          busy={actions.busy === 'plan-add_days'}
          onPress={() => addDays(dayCount)}
        />
      </View>
      <View style={adminStyles.actions}>
        <Button
          label="Make lifetime"
          variant="success"
          busy={actions.busy === 'plan-lifetime'}
          onPress={() =>
            actions.confirm(
              'Lifetime Premium?',
              `${user.email} gets Premium with no end date.`,
              'Make lifetime',
              () => setPlan({ action: 'lifetime' }, 'Premium is now lifetime.'),
              { destructive: false },
            )
          }
        />
        <Button
          label="Remove Premium"
          variant="danger"
          busy={actions.busy === 'plan-revoke'}
          disabled={!user.plan_active && user.plan_status !== 'lifetime'}
          onPress={() =>
            actions.confirm(
              'Remove Premium?',
              `${user.email} loses Premium access immediately. No refund is issued by this.`,
              'Remove',
              () => setPlan({ action: 'revoke' }, 'Premium removed.'),
            )
          }
        />
      </View>
    </Card>
  );
}

function AccessControls({ user, isMe, actions }: Section) {
  const approved = user.approval_status === 'approved';
  return (
    <Card>
      <View style={[adminStyles.row, styles.wrap]}>
        {approved ? (
          <Button
            label="Revoke approval"
            variant="secondary"
            busy={actions.busy === 'approval'}
            disabled={isMe}
            onPress={() =>
              actions.confirm(
                'Revoke approval?',
                'They will not be able to subscribe until approved again.',
                'Revoke',
                () =>
                  actions.run(
                    'approval',
                    () => adminUsersApi.setApproval(user.id, 'rejected'),
                    'Approval revoked.',
                  ),
              )
            }
          />
        ) : (
          <Button
            label="Approve account"
            variant="success"
            busy={actions.busy === 'approval'}
            onPress={() =>
              actions.run(
                'approval',
                () => adminUsersApi.setApproval(user.id, 'approved'),
                'Account approved. They can subscribe now.',
              )
            }
          />
        )}
        <Button
          label={user.can_upload_content ? 'Stop uploads' : 'Allow uploads'}
          variant={user.can_upload_content ? 'secondary' : 'success'}
          busy={actions.busy === 'uploads'}
          onPress={() =>
            actions.run(
              'uploads',
              () => adminUsersApi.setFlags(user.id, { canUpload: !user.can_upload_content }),
              user.can_upload_content
                ? 'They can no longer upload.'
                : 'They can upload content now.',
            )
          }
        />
        <Button
          label={user.is_admin ? 'Remove admin' : 'Make admin'}
          variant={user.is_admin ? 'danger' : 'primary'}
          disabled={isMe && user.is_admin}
          busy={actions.busy === 'admin'}
          onPress={() =>
            actions.confirm(
              user.is_admin ? 'Remove admin rights?' : 'Make this person an admin?',
              user.is_admin
                ? `${user.email} loses the admin panel.`
                : `${user.email} gets full control of Cloudlynk, the same as you.`,
              user.is_admin ? 'Remove' : 'Make admin',
              () =>
                actions.run(
                  'admin',
                  () => adminUsersApi.setFlags(user.id, { isAdmin: !user.is_admin }),
                  user.is_admin
                    ? 'Admin rights removed.'
                    : 'They are an admin now. They may need to reopen the app.',
                ),
              { destructive: user.is_admin },
            )
          }
        />
      </View>
      {isMe ? (
        <Text style={[adminStyles.muted, styles.spaced]}>
          This is your account. You cannot remove your own admin rights or suspend yourself.
        </Text>
      ) : null}
    </Card>
  );
}

function StatusControls({ user, isMe, actions }: Section) {
  const setStatus = (status: 'active' | 'suspended' | 'banned', done: string) =>
    actions.run('status', () => adminUsersApi.setFlags(user.id, { accountStatus: status }), done);

  return (
    <Card>
      <Text style={adminStyles.muted}>
        Suspended and banned accounts cannot watch, post, join or pay. Their content stays hidden
        while they are not active.
      </Text>
      <View style={adminStyles.actions}>
        {user.account_status !== 'active' ? (
          <Button
            label="Reactivate"
            variant="success"
            busy={actions.busy === 'status'}
            onPress={() => setStatus('active', 'Account reactivated.')}
          />
        ) : (
          <>
            <Button
              label="Suspend"
              variant="secondary"
              disabled={isMe}
              busy={actions.busy === 'status'}
              onPress={() =>
                actions.confirm(
                  'Suspend this account?',
                  'You can reactivate it any time.',
                  'Suspend',
                  () => setStatus('suspended', 'Account suspended.'),
                )
              }
            />
            <Button
              label="Ban"
              variant="danger"
              disabled={isMe}
              busy={actions.busy === 'status'}
              onPress={() =>
                actions.confirm(
                  'Ban this account?',
                  'For serious or repeated violations. You can still reactivate it later.',
                  'Ban',
                  () => setStatus('banned', 'Account banned.'),
                )
              }
            />
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 60 },
  chips: { marginTop: 10, flexWrap: 'wrap' },
  spaced: { marginTop: 10 },
  wrap: { flexWrap: 'wrap' },
  flex: { flex: 1 },
});
