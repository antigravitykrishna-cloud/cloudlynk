import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { AdminContentService, AuditEntry, AUDIT_ACTION_LABELS } from '../../lib/adminContent';

// The admin audit log, newest first. admin_audit_log has RLS enabled with no
// policies at all, so this is only readable through admin_list_audit_log,
// which verifies is_admin itself.

const FILTERS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: 'All' },
  { key: 'post', label: 'Posts' },
  { key: 'user', label: 'Users' },
];

const ACTION_COLORS: Record<string, string> = {
  access_granted: '#2ED47A',
  access_revoked: '#FF4D6D',
  access_level_changed: '#FFC65C',
  post_status_changed: '#38bdf8',
};

function describeMetadata(entry: AuditEntry): string | null {
  const m = entry.metadata;
  if (!m) return null;
  if (entry.action === 'access_level_changed' || entry.action === 'post_status_changed') {
    if (m.from || m.to) return `${m.from ?? '?'} → ${m.to ?? '?'}`;
  }
  if (entry.action === 'access_granted') {
    const until = m.expires_at ? `until ${new Date(String(m.expires_at)).toLocaleDateString()}` : 'until revoked';
    return `${until}${m.reason ? ` · ${m.reason}` : ''}`;
  }
  return null;
}

export default function AdminAuditScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (targetType?: string) => {
    try {
      setEntries(await AdminContentService.listAuditLog(100, targetType));
    } catch (err) {
      if (__DEV__) console.error('AdminAudit load error:', err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(filter); }, [load, filter]));

  const selectFilter = (key: string | undefined) => {
    setFilter(key);
    setLoading(true);
    load(key);
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.headerBack} activeOpacity={0.7}>
            <Text style={styles.headerBackTxt}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Audit Log</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.emptyState}><Text style={styles.emptyText}>Access denied</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={styles.headerBackTxt}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Audit Log</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.label}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => selectFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#2E7DFF" size="large" style={{ marginTop: 60 }} />
      ) : entries.length === 0 ? (
        <View style={styles.emptyState}><Text style={styles.emptyText}>Nothing logged yet</Text></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
          {entries.map(e => {
            const detail = describeMetadata(e);
            return (
              <View key={e.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={[styles.badge, { backgroundColor: ACTION_COLORS[e.action] ?? '#6B7C97' }]}>
                    <Text style={styles.badgeText}>
                      {(AUDIT_ACTION_LABELS[e.action] ?? e.action).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.cardDate}>{new Date(e.created_at).toLocaleString()}</Text>
                </View>
                <Text style={styles.metaText}>
                  by {e.admin_name || e.admin_email || 'Unknown admin'}
                </Text>
                <Text style={styles.metaText}>
                  {e.target_type}
                  {e.target_id ? ` · ${e.target_id.slice(0, 8)}…` : ''}
                </Text>
                {!!detail && <Text style={styles.detailText}>{detail}</Text>}
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
    backgroundColor: '#0B1220', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#22304A',
  },
  headerBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { color: '#2E7DFF', fontSize: 28, fontWeight: '700', lineHeight: 28 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterTab: { backgroundColor: '#182437', borderWidth: 1, borderColor: '#22304A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  filterTabActive: { backgroundColor: '#2E7DFF', borderColor: '#2E7DFF' },
  filterTabText: { color: '#9FB0C9', fontSize: 12, fontWeight: '700' },
  filterTabTextActive: { color: '#FFFFFF' },
  list: { paddingBottom: 12, paddingHorizontal: 16 },
  card: { backgroundColor: '#182437', borderRadius: 12, borderWidth: 1, borderColor: '#22304A', padding: 16, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '900', color: '#0B1220', letterSpacing: 0.5 },
  cardDate: { fontSize: 11, color: '#6B7C97', fontWeight: '500' },
  metaText: { fontSize: 13, color: '#9FB0C9', fontWeight: '500', marginBottom: 2 },
  detailText: { fontSize: 12, color: '#FFC65C', fontWeight: '600', marginTop: 6 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, color: '#9FB0C9', fontWeight: '600', textAlign: 'center' },
});
