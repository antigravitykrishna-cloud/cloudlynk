import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { AdminModerationService, ContentReport, ModerationAction } from '../../lib/compliance';
import { AdminContentService } from '../../lib/adminContent';

interface EnrichedReport extends ContentReport {
  reporterName: string;
  reportedUserName: string | null;
  postTitle: string | null;
}

const REASON_LABELS: Record<string, string> = {
  inappropriate_content: 'Inappropriate content',
  copyright_violation: 'Copyright violation',
  harassment: 'Harassment or bullying',
  spam: 'Spam or scam account',
  impersonation: 'Impersonation',
  hate_speech: 'Hate speech',
  other: 'Other',
};

const TARGET_BADGE: Record<string, { label: string; color: string }> = {
  content: { label: 'CONTENT', color: '#2E7DFF' },
  user: { label: 'USER', color: '#f472b6' },
  copyright: { label: 'COPYRIGHT', color: '#facc15' },
  other: { label: 'OTHER', color: '#9FB0C9' },
};

// Admin moderation queue for content_reports. AdminModerationService
// (lib/compliance.ts) has existed since v48, but nothing in the app ever
// called it — reports were being filed (via ChannelService.reportContent /
// ReportService.reportUser) into a table nobody could see through the UI.
// This is the missing other half: where those reports actually go to be
// reviewed and acted on. Every action here still independently re-verifies
// is_admin server-side inside admin_resolve_report — this screen is a
// convenience, not the security boundary.
export default function AdminReportsScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [reports, setReports] = useState<EnrichedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ id: string; action: ModerationAction } | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await AdminModerationService.listPendingReports();

      const reporterIds = [...new Set(rows.map(r => r.reporter_id))];
      const reportedIds = [...new Set(rows.map(r => r.reported_user_id).filter(Boolean))] as string[];
      const profileIds = [...new Set([...reporterIds, ...reportedIds])];
      const postIds = [...new Set(rows.map(r => r.post_id).filter(Boolean))] as string[];

      // Names come from admin_get_profiles_by_ids, not a direct select.
      // public.profiles' only SELECT policy is `auth.uid() = id`, so the
      // direct `.in('id', ids)` this used to do returned an empty set for
      // everyone except the admin themselves — silently, with no error —
      // which is why every row here used to read 'Unknown'. The v56 reader
      // is SECURITY DEFINER and verifies is_admin itself.
      const [profiles, { data: posts }] = await Promise.all([
        AdminContentService.getProfilesByIds(profileIds),
        postIds.length
          ? supabase.from('channel_posts').select('id, title').in('id', postIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p.full_name || p.username || p.email || 'Unknown']));
      const postMap = new Map((posts ?? []).map((p: any) => [p.id, p.title]));

      setReports(rows.map(r => ({
        ...r,
        reporterName: profileMap.get(r.reporter_id) ?? 'Unknown',
        reportedUserName: r.reported_user_id ? (profileMap.get(r.reported_user_id) ?? 'Unknown') : null,
        postTitle: r.post_id ? (postMap.get(r.post_id) ?? null) : null,
      })));
    } catch (err) {
      if (__DEV__) console.error('AdminReports load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const startAction = (report: EnrichedReport, action: ModerationAction) => {
    // Actions with an obvious, low-risk resolution don't need a typed note.
    if (action === 'dismiss') {
      void resolve(report.id, action, 'Dismissed — no violation found.');
      return;
    }
    setPendingAction({ id: report.id, action });
    setNote('');
  };

  const resolve = async (reportId: string, action: ModerationAction, resolution: string) => {
    setActingId(reportId);
    try {
      await AdminModerationService.resolveReport(reportId, action, resolution, resolution);
      setReports(prev => prev.filter(r => r.id !== reportId));
      setPendingAction(null);
      setNote('');
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Could not resolve report.');
    } finally {
      setActingId(null);
    }
  };

  const confirmPendingAction = () => {
    if (!pendingAction) return;
    if (!note.trim()) {
      showAlert('Note required', 'Add a short note explaining this action (kept for audit history).');
      return;
    }
    resolve(pendingAction.id, pendingAction.action, note.trim());
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.headerBack} activeOpacity={0.7}>
            <Text style={styles.headerBackTxt}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reports</Text>
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
        <Text style={styles.headerTitle}>Reports</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#2E7DFF" size="large" style={{ marginTop: 60 }} />
      ) : reports.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No pending reports</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
          {reports.map(item => {
            const badge = TARGET_BADGE[item.target_type ?? 'other'] ?? TARGET_BADGE.other;
            const isActing = actingId === item.id;
            const isPending = pendingAction?.id === item.id;
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={[styles.badge, { backgroundColor: badge.color }]}>
                    <Text style={styles.badgeText}>{badge.label}</Text>
                  </View>
                  <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>

                <Text style={styles.reasonText}>{REASON_LABELS[item.reason] ?? item.reason}</Text>
                <Text style={styles.metaText}>Reported by {item.reporterName}</Text>
                {item.reportedUserName && <Text style={styles.metaText}>Account: {item.reportedUserName}</Text>}
                {item.postTitle && <Text style={styles.metaText}>Content: {item.postTitle}</Text>}

                {isPending ? (
                  <View style={styles.noteForm}>
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Note for the audit log (required)…"
                      placeholderTextColor="#6B7C97"
                      value={note}
                      onChangeText={setNote}
                      multiline
                    />
                    <View style={styles.noteFormActions}>
                      <TouchableOpacity style={styles.cancelBtn} onPress={() => setPendingAction(null)} activeOpacity={0.7}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.confirmBtn} onPress={confirmPendingAction} activeOpacity={0.7} disabled={isActing}>
                        {isActing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmBtnText}>Confirm</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.actionsWrap}>
                    <TouchableOpacity style={styles.actionBtnGhost} onPress={() => startAction(item, 'dismiss')} activeOpacity={0.7}>
                      <Text style={styles.actionBtnGhostText}>Dismiss</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtnGhost} onPress={() => startAction(item, 'warn')} activeOpacity={0.7}>
                      <Text style={styles.actionBtnGhostText}>Warn</Text>
                    </TouchableOpacity>
                    {item.post_id && (
                      <TouchableOpacity style={styles.actionBtnWarn} onPress={() => startAction(item, 'remove_content')} activeOpacity={0.7}>
                        <Text style={styles.actionBtnWarnText}>Remove content</Text>
                      </TouchableOpacity>
                    )}
                    {item.channel_id && (
                      <TouchableOpacity style={styles.actionBtnWarn} onPress={() => startAction(item, 'suspend_channel')} activeOpacity={0.7}>
                        <Text style={styles.actionBtnWarnText}>Suspend channel</Text>
                      </TouchableOpacity>
                    )}
                    {item.reported_user_id && (
                      <>
                        <TouchableOpacity style={styles.actionBtnDanger} onPress={() => startAction(item, 'suspend_user')} activeOpacity={0.7}>
                          <Text style={styles.actionBtnDangerText}>Suspend user</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtnDanger} onPress={() => startAction(item, 'ban_user')} activeOpacity={0.7}>
                          <Text style={styles.actionBtnDangerText}>Ban user</Text>
                        </TouchableOpacity>
                      </>
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
  list: { paddingVertical: 12, paddingHorizontal: 16 },
  card: { backgroundColor: '#182437', borderRadius: 12, borderWidth: 1, borderColor: '#22304A', padding: 16, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '900', color: '#0B1220', letterSpacing: 0.5 },
  cardDate: { fontSize: 11, color: '#6B7C97', fontWeight: '500' },
  reasonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 },
  metaText: { fontSize: 13, color: '#9FB0C9', fontWeight: '500', marginBottom: 2 },
  actionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtnGhost: { backgroundColor: '#22304A', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  actionBtnGhostText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  actionBtnWarn: { backgroundColor: '#FFC65C', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  actionBtnWarnText: { color: '#0B1220', fontSize: 12, fontWeight: '800' },
  actionBtnDanger: { backgroundColor: '#FF4D6D', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  actionBtnDangerText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  noteForm: { marginTop: 8 },
  noteInput: {
    backgroundColor: '#22304A', borderRadius: 8, borderWidth: 1, borderColor: '#2E7DFF',
    color: '#FFFFFF', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10, minHeight: 60,
    textAlignVertical: 'top', marginBottom: 10,
  },
  noteFormActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { backgroundColor: '#22304A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  cancelBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  confirmBtn: { backgroundColor: '#2E7DFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, minWidth: 90, alignItems: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, color: '#9FB0C9', fontWeight: '600' },
});
