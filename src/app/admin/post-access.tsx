import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { AdminContentService, AdminUser, PostGrantee } from '../../lib/adminContent';

// Per-post access management: who may watch this one video, regardless of
// whether they subscribe.
//
// A grant is NOT a subscription. It gives one person one post and never
// touches plan_status; revoking it never disturbs anything they have paid
// for. The database enforces both — see the v56 migration.

type DurationChoice = 'forever' | '7d' | '30d' | 'custom';

const DURATIONS: { key: DurationChoice; label: string }[] = [
  { key: 'forever', label: 'Until revoked' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'custom', label: 'Custom date' },
];

function expiryFor(choice: DurationChoice, customDate: string): string | null {
  if (choice === 'forever') return null;
  if (choice === '7d') return new Date(Date.now() + 7 * 86400_000).toISOString();
  if (choice === '30d') return new Date(Date.now() + 30 * 86400_000).toISOString();
  const parsed = new Date(customDate.trim());
  if (Number.isNaN(parsed.getTime())) throw new Error('Enter the custom date as YYYY-MM-DD.');
  if (parsed.getTime() <= Date.now()) throw new Error('That date is in the past.');
  return parsed.toISOString();
}

export default function AdminPostAccessScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { postId } = useLocalSearchParams<{ postId?: string }>();

  const [grantees, setGrantees] = useState<PostGrantee[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [duration, setDuration] = useState<DurationChoice>('forever');
  const [customDate, setCustomDate] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!postId) { setLoading(false); return; }
    try {
      setGrantees(await AdminContentService.getPostGrantees(postId));
    } catch (err) {
      if (__DEV__) console.error('AdminPostAccess load error:', err);
      setGrantees([]);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const runSearch = async () => {
    setSearching(true);
    try {
      setResults(await AdminContentService.searchUsers(search));
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Could not search users.');
    } finally {
      setSearching(false);
    }
  };

  const grant = async () => {
    if (!postId || !selected) return;
    let expiresAt: string | null;
    try {
      expiresAt = expiryFor(duration, customDate);
    } catch (err: any) {
      showAlert('Check the date', err.message);
      return;
    }
    setActingId(selected.id);
    try {
      await AdminContentService.grantAccess(selected.id, postId, expiresAt, reason.trim() || null);
      setSelected(null);
      setResults([]);
      setSearch('');
      setReason('');
      setDuration('forever');
      setCustomDate('');
      await load();
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Could not grant access.');
    } finally {
      setActingId(null);
    }
  };

  const revoke = (g: PostGrantee) => {
    if (!postId) return;
    showAlert('Revoke access?', `${g.email} will no longer be able to watch this post. Their subscription, if any, is unaffected.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setActingId(g.user_id);
          try {
            await AdminContentService.revokeAccess(g.user_id, postId);
            await load();
          } catch (err: any) {
            showAlert('Error', err?.message ?? 'Could not revoke access.');
          } finally {
            setActingId(null);
          }
        },
      },
    ]);
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
            <Text style={styles.headerBackTxt}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post Access</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.emptyState}><Text style={styles.emptyText}>Access denied</Text></View>
      </SafeAreaView>
    );
  }

  if (!postId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
            <Text style={styles.headerBackTxt}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post Access</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Open this from a post in Content.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.headerBackTxt}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post Access</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <Text style={styles.blurb}>
          Granting access lets one person watch this post without a subscription. It never changes
          their plan, and revoking it never affects anything they have paid for.
        </Text>

        {/* ── Grant form ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Grant access</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by email or name…"
              placeholderTextColor="#6B7C97"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              onSubmitEditing={runSearch}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.searchBtn} onPress={runSearch} activeOpacity={0.7} disabled={searching}>
              {searching ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.searchBtnText}>Find</Text>}
            </TouchableOpacity>
          </View>

          {results.map(u => (
            <TouchableOpacity
              key={u.id}
              style={[styles.userRow, selected?.id === u.id && styles.userRowSelected]}
              onPress={() => setSelected(u)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{u.full_name || u.email}</Text>
                <Text style={styles.metaText}>{u.email}</Text>
                <Text style={styles.metaText}>
                  plan: {u.plan_status ?? 'free'} · {u.account_status}
                </Text>
              </View>
              {selected?.id === u.id && <Text style={styles.tick}>{'✓'}</Text>}
            </TouchableOpacity>
          ))}

          {selected && (
            <View style={styles.grantForm}>
              <Text style={styles.label}>Duration</Text>
              <View style={styles.chipRow}>
                {DURATIONS.map(d => (
                  <TouchableOpacity
                    key={d.key}
                    style={[styles.chip, duration === d.key && styles.chipActive]}
                    onPress={() => setDuration(d.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, duration === d.key && styles.chipTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {duration === 'custom' && (
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#6B7C97"
                  value={customDate}
                  onChangeText={setCustomDate}
                  autoCapitalize="none"
                />
              )}

              <Text style={styles.label}>Reason (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Why does this person get access?"
                placeholderTextColor="#6B7C97"
                value={reason}
                onChangeText={setReason}
              />

              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelected(null)} activeOpacity={0.7}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={grant} activeOpacity={0.7} disabled={actingId === selected.id}>
                  {actingId === selected.id
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
                    : <Text style={styles.confirmBtnText}>Grant access</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Current grantees ── */}
        <Text style={styles.sectionHeading}>Who has access</Text>
        {loading ? (
          <ActivityIndicator color="#2E7DFF" size="large" style={{ marginTop: 30 }} />
        ) : grantees.length === 0 ? (
          <View style={styles.card}><Text style={styles.emptyText}>Nobody has been granted access to this post.</Text></View>
        ) : (
          grantees.map(g => (
            <View key={g.grant_id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <Text style={styles.userName} numberOfLines={1}>{g.full_name || g.email}</Text>
                <View style={[styles.badge, { backgroundColor: g.status === 'active' ? '#2ED47A' : '#6B7C97' }]}>
                  <Text style={styles.badgeText}>{g.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.metaText}>{g.email}</Text>
              <Text style={styles.metaText}>
                {g.expires_at ? `Expires ${new Date(g.expires_at).toLocaleString()}` : 'No expiry — until revoked'}
              </Text>
              {!!g.reason && <Text style={styles.reasonText}>Reason: {g.reason}</Text>}
              {!!g.granted_by_email && <Text style={styles.metaText}>Granted by {g.granted_by_email}</Text>}
              {g.status === 'active' && (
                <View style={styles.actionsWrap}>
                  <TouchableOpacity style={styles.revokeBtn} onPress={() => revoke(g)} activeOpacity={0.7} disabled={actingId === g.user_id}>
                    {actingId === g.user_id
                      ? <ActivityIndicator color="#FF4D6D" size="small" />
                      : <Text style={styles.revokeBtnText}>Revoke</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B1220' },
  header: {
    backgroundColor: '#0B1220', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#22304A',
  },
  headerBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { color: '#2E7DFF', fontSize: 28, fontWeight: '700', lineHeight: 28 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  blurb: { color: '#9FB0C9', fontSize: 12, fontWeight: '500', lineHeight: 18, marginBottom: 12 },
  card: { backgroundColor: '#182437', borderRadius: 12, borderWidth: 1, borderColor: '#22304A', padding: 16, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 10 },
  sectionTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginBottom: 10 },
  sectionHeading: { color: '#9FB0C9', fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: {
    flex: 1, backgroundColor: '#22304A', borderRadius: 8, borderWidth: 1, borderColor: '#22304A',
    color: '#FFFFFF', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchBtn: { backgroundColor: '#2E7DFF', paddingHorizontal: 18, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 70 },
  searchBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#22304A' },
  userRowSelected: { backgroundColor: '#241a12' },
  userName: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', flex: 1 },
  tick: { color: '#2E7DFF', fontSize: 18, fontWeight: '900' },
  metaText: { fontSize: 12, color: '#9FB0C9', fontWeight: '500', marginTop: 2 },
  reasonText: { fontSize: 12, color: '#FFC65C', fontWeight: '600', marginTop: 6 },
  grantForm: { marginTop: 12 },
  label: { color: '#9FB0C9', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#22304A', borderWidth: 1, borderColor: '#22304A', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  chipActive: { backgroundColor: '#2E7DFF', borderColor: '#2E7DFF' },
  chipText: { color: '#9FB0C9', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  input: {
    backgroundColor: '#22304A', borderRadius: 8, borderWidth: 1, borderColor: '#22304A',
    color: '#FFFFFF', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4,
  },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { backgroundColor: '#22304A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  cancelBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  confirmBtn: { backgroundColor: '#2E7DFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, minWidth: 120, alignItems: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 11, fontWeight: '900', color: '#0B1220', letterSpacing: 0.5 },
  actionsWrap: { flexDirection: 'row', gap: 8, marginTop: 12 },
  revokeBtn: { backgroundColor: '#22304A', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8, minWidth: 90, alignItems: 'center' },
  revokeBtnText: { color: '#FF4D6D', fontSize: 12, fontWeight: '800' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 14, color: '#9FB0C9', fontWeight: '600', textAlign: 'center' },
});
