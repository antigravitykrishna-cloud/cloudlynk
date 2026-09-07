import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { AdminContentService, UserGrant } from '../../lib/adminContent';

// The vetting queue for the v55 PRE-purchase approval gate: who is allowed
// to reach the subscribe flow at all. Approving or rejecting here decides
// nothing about content and nothing about an existing entitlement — a
// rejected account keeps a fully working free tier, and if it has somehow
// already paid, verify-play-receipt still grants the plan. See
// supabase/migrations/20260905120000_v55_user_approval_gate.sql.
//
// The `isAdmin` check below is UX only. Both RPCs this screen calls
// (admin_list_user_approvals, admin_set_user_approval) re-verify is_admin
// server-side themselves — that is the actual security boundary, exactly as
// it is for admin_resolve_report and app/admin/reports.tsx.

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

type ApprovalRow = {
  id: string;
  email: string;
  full_name: string | null;
  username: string | null;
  created_at: string;
  approval_status: ApprovalStatus;
  approval_note: string | null;
  approval_reviewed_at: string | null;
};

const FILTERS: { key: ApprovalStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function AdminUserApprovalsScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [filter, setFilter] = useState<ApprovalStatus>('pending');
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [pendingReject, setPendingReject] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // The client approaches access from both directions: from a post (see who
  // can watch it) and from a person (see what they can watch). This is the
  // second one — app/admin/post-access.tsx is the first.
  const [grantsFor, setGrantsFor] = useState<string | null>(null);
  const [grants, setGrants] = useState<UserGrant[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);

  const load = useCallback(async (status: ApprovalStatus) => {
    try {
      const { data, error } = await supabase.rpc('admin_list_user_approvals', { p_status: status });
      if (error) throw error;
      setRows((data ?? []) as ApprovalRow[]);
    } catch (err) {
      if (__DEV__) console.error('AdminUserApprovals load error:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(filter);
    }, [load, filter])
  );

  const selectFilter = (next: ApprovalStatus) => {
    if (next === filter) return;
    setPendingReject(null);
    setNote('');
    setFilter(next);
    setLoading(true);
    load(next);
  };

  const setApproval = async (userId: string, status: 'approved' | 'rejected', reviewNote?: string) => {
    setActingId(userId);
    try {
      const { error } = await supabase.rpc('admin_set_user_approval', {
        p_user_id: userId,
        p_status: status,
        p_note: reviewNote?.trim() ? reviewNote.trim() : null,
      });
      if (error) throw error;
      // The row no longer belongs in the list currently on screen.
      setRows(prev => prev.filter(r => r.id !== userId));
      setPendingReject(null);
      setNote('');
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Could not update this account.');
    } finally {
      setActingId(null);
    }
  };

  const toggleGrants = async (userId: string) => {
    if (grantsFor === userId) { setGrantsFor(null); setGrants([]); return; }
    setGrantsFor(userId);
    setGrants([]);
    setGrantsLoading(true);
    try {
      setGrants(await AdminContentService.getUserGrants(userId));
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Could not load grants.');
      setGrantsFor(null);
    } finally {
      setGrantsLoading(false);
    }
  };

  const revokeGrant = (userId: string, postId: string, title: string | null) => {
    showAlert(
      'Revoke access?',
      `This person will no longer be able to watch "${title ?? 'this post'}". Their subscription, if any, is unaffected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await AdminContentService.revokeAccess(userId, postId);
              setGrants(await AdminContentService.getUserGrants(userId));
            } catch (err: any) {
              showAlert('Error', err?.message ?? 'Could not revoke access.');
            }
          },
        },
      ],
    );
  };

  const confirmReject = () => {
    if (!pendingReject) return;
    setApproval(pendingReject, 'rejected', note);
  };

  const displayName = (r: ApprovalRow) => r.full_name || r.username || '—';

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.headerBack} activeOpacity={0.7}>
            <Text style={styles.headerBackTxt}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>User Approvals</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Access denied</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={styles.headerBackTxt}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Approvals</Text>
        <View style={{ width: 32 }} />
      </View>

      <Text style={styles.blurb}>
        Approving an account lets it reach the subscribe flow. It does not unlock content, and
        rejecting never affects a subscription someone has already paid for.
      </Text>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => selectFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#2E7DFF" size="large" style={{ marginTop: 60 }} />
      ) : rows.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {filter === 'pending' ? 'No accounts waiting for review' : `No ${filter} accounts`}
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
          {rows.map(item => {
            const isActing = actingId === item.id;
            const isRejecting = pendingReject === item.id;
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.nameText} numberOfLines={1}>{displayName(item)}</Text>
                  <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.metaText} numberOfLines={1}>{item.email}</Text>
                <Text style={styles.metaText}>
                  Signed up {new Date(item.created_at).toLocaleString()}
                </Text>
                {item.approval_reviewed_at && (
                  <Text style={styles.metaText}>
                    Reviewed {new Date(item.approval_reviewed_at).toLocaleString()}
                  </Text>
                )}
                {!!item.approval_note && (
                  <Text style={styles.noteText}>Note: {item.approval_note}</Text>
                )}

                {isRejecting ? (
                  <View style={styles.noteForm}>
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Why is this account being rejected? (required)"
                      placeholderTextColor="#6B7C97"
                      value={note}
                      onChangeText={setNote}
                      multiline
                    />
                    <View style={styles.noteFormActions}>
                      <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={() => { setPendingReject(null); setNote(''); }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.confirmBtn}
                        onPress={confirmReject}
                        activeOpacity={0.7}
                        disabled={isActing || !note.trim()}
                      >
                        {isActing
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.confirmBtnText}>Confirm reject</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.actionsWrap}>
                    {item.approval_status !== 'approved' && (
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => setApproval(item.id, 'approved')}
                        activeOpacity={0.7}
                        disabled={isActing}
                      >
                        {isActing
                          ? <ActivityIndicator color="#0B1220" size="small" />
                          : <Text style={styles.approveBtnText}>Approve</Text>}
                      </TouchableOpacity>
                    )}
                    {item.approval_status !== 'rejected' && (
                      <TouchableOpacity
                        style={styles.rejectBtn}
                        onPress={() => { setPendingReject(item.id); setNote(''); }}
                        activeOpacity={0.7}
                        disabled={isActing}
                      >
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.grantsBtn}
                      onPress={() => toggleGrants(item.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.grantsBtnText}>
                        {grantsFor === item.id ? 'Hide grants' : 'Grants'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {grantsFor === item.id && (
                  <View style={styles.grantsPanel}>
                    {grantsLoading ? (
                      <ActivityIndicator color="#2E7DFF" size="small" style={{ marginVertical: 8 }} />
                    ) : grants.length === 0 ? (
                      <Text style={styles.metaText}>No content grants.</Text>
                    ) : (
                      grants.map(g => (
                        <View key={g.grant_id} style={styles.grantRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.grantTitle} numberOfLines={1}>
                              {g.post_title ?? 'Untitled post'}
                            </Text>
                            <Text style={styles.metaText}>
                              {g.status === 'active' ? 'Active' : 'Revoked'}
                              {g.expires_at ? ` · expires ${new Date(g.expires_at).toLocaleDateString()}` : ' · until revoked'}
                            </Text>
                          </View>
                          {g.status === 'active' && (
                            <TouchableOpacity
                              style={styles.grantRevokeBtn}
                              onPress={() => revokeGrant(item.id, g.post_id, g.post_title)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.grantRevokeText}>Revoke</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B1220' },
  header: {
    backgroundColor: '#0B1220',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#22304A',
  },
  headerBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { color: '#2E7DFF', fontSize: 28, fontWeight: '700', lineHeight: 28 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  blurb: {
    color: '#9FB0C9', fontSize: 12, fontWeight: '500', lineHeight: 18,
    paddingHorizontal: 16, paddingTop: 12,
  },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterTab: { backgroundColor: '#182437', borderWidth: 1, borderColor: '#22304A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  filterTabActive: { backgroundColor: '#2E7DFF', borderColor: '#2E7DFF' },
  filterTabText: { color: '#9FB0C9', fontSize: 12, fontWeight: '700' },
  filterTabTextActive: { color: '#FFFFFF' },
  list: { paddingBottom: 12, paddingHorizontal: 16 },
  card: { backgroundColor: '#182437', borderRadius: 12, borderWidth: 1, borderColor: '#22304A', padding: 16, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 10 },
  nameText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', flex: 1 },
  cardDate: { fontSize: 11, color: '#6B7C97', fontWeight: '500' },
  metaText: { fontSize: 13, color: '#9FB0C9', fontWeight: '500', marginBottom: 2 },
  noteText: { fontSize: 12, color: '#FFC65C', fontWeight: '600', marginTop: 6 },
  actionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  approveBtn: { backgroundColor: '#2E7DFF', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8, minWidth: 92, alignItems: 'center' },
  approveBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  rejectBtn: { backgroundColor: '#22304A', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8 },
  rejectBtnText: { color: '#FF4D6D', fontSize: 12, fontWeight: '800' },
  grantsBtn: { backgroundColor: '#22304A', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8 },
  grantsBtnText: { color: '#38bdf8', fontSize: 12, fontWeight: '800' },
  grantsPanel: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#22304A', paddingTop: 10 },
  grantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#22304A' },
  grantTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  grantRevokeBtn: { backgroundColor: '#22304A', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  grantRevokeText: { color: '#FF4D6D', fontSize: 11, fontWeight: '800' },
  noteForm: { marginTop: 12 },
  noteInput: {
    backgroundColor: '#22304A', borderRadius: 8, borderWidth: 1, borderColor: '#2E7DFF',
    color: '#FFFFFF', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10, minHeight: 60,
    textAlignVertical: 'top', marginBottom: 10,
  },
  noteFormActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { backgroundColor: '#22304A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  cancelBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  confirmBtn: { backgroundColor: '#FF4D6D', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, minWidth: 120, alignItems: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, color: '#9FB0C9', fontWeight: '600', textAlign: 'center' },
});
