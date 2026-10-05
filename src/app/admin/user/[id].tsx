import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { AdminHeader, ActionButton, Card, Chip, SectionLabel, adminStyles, formatDate, planChip } from '../../../components/AdminUI';
import { showAlert } from '../../../components/Feedback';
import { fireHaptic } from '../../../components/Press';
import { Colors } from '../../../constants/theme';
import { AdminControl, type AdminUserDetail, type PlanAction } from '../../../lib/adminControl';
import { useAuth } from '../../../hooks/useAuth';

// One account, every control. Each action asks first, runs one audited RPC
// (v82), then reloads -- the screen always shows what the database now says,
// never what the button assumed.

export default function AdminUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me } = useAuth();
  const [u, setU] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState('30');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setU(await AdminControl.getUser(id));
    } catch (e: any) {
      showAlert('Could not load this user', e?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      fireHaptic('success');
      await load();
      showAlert('Done', done);
    } catch (e: any) {
      fireHaptic('error');
      showAlert('Could not do that', e?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const confirm = (title: string, message: string, label: string, destructive: boolean, onYes: () => void) =>
    showAlert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: destructive ? 'destructive' : 'default', onPress: onYes },
    ]);

  const plan = (a: PlanAction, label: string) =>
    run(`plan-${a.action}`, () => AdminControl.setPlan(id!, a), label);

  if (!u) {
    return (
      <SafeAreaView style={adminStyles.safe} edges={['top']}>
        <AdminHeader title="User" />
        <Text style={adminStyles.empty}>{loading ? 'Loading…' : 'User not found.'}</Text>
      </SafeAreaView>
    );
  }

  const isMe = u.id === me?.id;
  const n = Math.max(0, Math.min(3650, parseInt(days, 10) || 0));

  return (
    <SafeAreaView style={adminStyles.safe} edges={['top']}>
      <AdminHeader title={u.full_name?.trim() || 'User'} />
      <ScrollView
        contentContainerStyle={adminStyles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.brandBlue} />}
      >
        <Card>
          <Text style={adminStyles.name}>{u.full_name?.trim() || 'No name'}</Text>
          <Text style={adminStyles.muted} selectable>{u.email}</Text>
          <View style={[adminStyles.row, { marginTop: 10, flexWrap: 'wrap' }]}>
            {planChip(u)}
            {u.is_admin && <Chip label="ADMIN" tone="brand" />}
            {u.can_upload_content && <Chip label="CAN UPLOAD" tone="brand" />}
            <Chip label={(u.account_status ?? 'active').toUpperCase()} tone={u.account_status === 'active' ? 'good' : 'bad'} />
            <Chip label={`APPROVAL ${(u.approval_status ?? 'approved').toUpperCase()}`} tone={u.approval_status === 'approved' || !u.approval_status ? 'good' : 'warn'} />
          </View>
          <Text style={[adminStyles.muted, { marginTop: 10 }]}>
            Joined {formatDate(u.created_at)} · {u.channels_joined} channels joined · {u.channels_owned} owned · {u.posts} posts · {u.payments_paid} payments
            {u.last_payment_at ? ` (last ${formatDate(u.last_payment_at)})` : ''}
          </Text>
        </Card>

        <SectionLabel>Premium</SectionLabel>
        <Card>
          <Text style={adminStyles.muted}>
            {u.plan_status === 'lifetime' ? 'Lifetime Premium.'
              : u.plan_active ? `Premium until ${formatDate(u.plan_expires_at)}.`
              : 'No active Premium.'}
            {' '}Adding days extends from the current end date if the plan is still running. A Google Play subscription can later be updated by Google's own renewals.
          </Text>
          <View style={[adminStyles.row, { marginTop: 12 }]}>
            {[7, 30, 180, 365].map(d => (
              <ActionButton key={d} label={`+${d}d`} tone="neutral" busy={busy === 'plan-add_days' && n === d}
                onPress={() => { setDays(String(d)); plan({ action: 'add_days', days: d }, `Added ${d} days of Premium.`); }} />
            ))}
          </View>
          <View style={[adminStyles.row, { marginTop: 10 }]}>
            <TextInput
              style={[adminStyles.input, { flex: 1 }]}
              value={days}
              onChangeText={t => setDays(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="Days"
              placeholderTextColor={Colors.textMuted}
              maxLength={4}
            />
            <ActionButton label={`Add ${n || ''} days`} disabled={n < 1} busy={busy === 'plan-add_days'}
              onPress={() => plan({ action: 'add_days', days: n }, `Added ${n} days of Premium.`)} />
          </View>
          <View style={[adminStyles.row, { marginTop: 10 }]}>
            <ActionButton label="Make lifetime" tone="good" busy={busy === 'plan-lifetime'}
              onPress={() => confirm('Lifetime Premium?', `${u.email} gets Premium with no end date.`, 'Make lifetime', false,
                () => plan({ action: 'lifetime' }, 'Premium is now lifetime.'))} />
            <ActionButton label="Remove Premium" tone="bad" busy={busy === 'plan-revoke'}
              disabled={!u.plan_active && u.plan_status !== 'lifetime'}
              onPress={() => confirm('Remove Premium?', `${u.email} loses Premium access immediately. No refund is issued by this.`, 'Remove', true,
                () => plan({ action: 'revoke' }, 'Premium removed.'))} />
          </View>
        </Card>

        <SectionLabel>Access</SectionLabel>
        <Card>
          <View style={[adminStyles.row, { flexWrap: 'wrap' }]}>
            {u.approval_status !== 'approved' ? (
              <ActionButton label="Approve account" tone="good" busy={busy === 'approve'}
                onPress={() => run('approve', () => AdminControl.setApproval(u.id, 'approved'), 'Account approved. They can subscribe now.')} />
            ) : (
              <ActionButton label="Revoke approval" tone="neutral" busy={busy === 'approve'} disabled={isMe}
                onPress={() => confirm('Revoke approval?', 'They will not be able to subscribe until approved again.', 'Revoke', true,
                  () => run('approve', () => AdminControl.setApproval(u.id, 'rejected'), 'Approval revoked.'))} />
            )}
            <ActionButton
              label={u.can_upload_content ? 'Stop uploads' : 'Allow uploads'}
              tone={u.can_upload_content ? 'neutral' : 'good'}
              busy={busy === 'upload'}
              onPress={() => run('upload', () => AdminControl.setFlags(u.id, { canUpload: !u.can_upload_content }),
                u.can_upload_content ? 'They can no longer upload.' : 'They can upload content now.')} />
          </View>
          <View style={[adminStyles.row, { marginTop: 10 }]}>
            <ActionButton
              label={u.is_admin ? 'Remove admin' : 'Make admin'}
              tone={u.is_admin ? 'bad' : 'brand'}
              disabled={isMe && u.is_admin}
              busy={busy === 'admin'}
              onPress={() => confirm(
                u.is_admin ? 'Remove admin rights?' : 'Make this person an admin?',
                u.is_admin ? `${u.email} loses the admin panel.` : `${u.email} gets full control of Cloudlynk, the same as you.`,
                u.is_admin ? 'Remove' : 'Make admin', !!u.is_admin,
                () => run('admin', () => AdminControl.setFlags(u.id, { isAdmin: !u.is_admin }),
                  u.is_admin ? 'Admin rights removed.' : 'They are an admin now. They may need to reopen the app.'))} />
          </View>
          {isMe && <Text style={[adminStyles.muted, { marginTop: 8 }]}>This is your account. You cannot remove your own admin rights or suspend yourself.</Text>}
        </Card>

        <SectionLabel>Account status</SectionLabel>
        <Card>
          <Text style={adminStyles.muted}>
            Suspended and banned accounts cannot watch, post, join or pay. Their content stays hidden while they are not active.
          </Text>
          <View style={[adminStyles.row, { marginTop: 12 }]}>
            {u.account_status !== 'active' ? (
              <ActionButton label="Reactivate" tone="good" busy={busy === 'status'}
                onPress={() => run('status', () => AdminControl.setFlags(u.id, { accountStatus: 'active' }), 'Account reactivated.')} />
            ) : (
              <>
                <ActionButton label="Suspend" tone="neutral" disabled={isMe} busy={busy === 'status'}
                  onPress={() => confirm('Suspend this account?', 'You can reactivate it any time.', 'Suspend', true,
                    () => run('status', () => AdminControl.setFlags(u.id, { accountStatus: 'suspended' }), 'Account suspended.'))} />
                <ActionButton label="Ban" tone="bad" disabled={isMe} busy={busy === 'status'}
                  onPress={() => confirm('Ban this account?', 'For serious or repeated violations. You can still reactivate it later.', 'Ban', true,
                    () => run('status', () => AdminControl.setFlags(u.id, { accountStatus: 'banned' }), 'Account banned.'))} />
              </>
            )}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
