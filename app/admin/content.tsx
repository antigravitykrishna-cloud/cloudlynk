import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { AdminContentService, AdminPost, AdminPostStatus } from '../../lib/adminContent';
import { AccessLevel } from '../../lib/posts';

// The admin content list. Everything Cloudlynk publishes, plus every
// user-created post, filterable by status and access level.
//
// Access level is changeable HERE, after upload — not only at creation.
// That is an explicit client requirement, and the creator-side upload flow
// (app/upload/add-content.tsx) only offers it at creation time.
//
// Both isAdmin checks in this file are UX. Every write goes through an RPC
// that re-verifies is_admin in the database.

type StatusFilter = AdminPostStatus | 'all';
type AccessFilter = AccessLevel | 'all';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Published' },
  { key: 'rejected', label: 'Rejected' },
];

const ACCESS_FILTERS: { key: AccessFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'free', label: 'Free' },
  { key: 'premium', label: 'Premium' },
];

const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8',
  pending: '#f0b429',
  approved: '#22c55e',
  rejected: '#FF4D6D',
  removed: '#666666',
};

export default function AdminContentScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async (status: StatusFilter, access: AccessFilter) => {
    try {
      setPosts(await AdminContentService.listPosts({ status, accessLevel: access }));
    } catch (err) {
      if (__DEV__) console.error('AdminContent load error:', err);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(statusFilter, accessFilter);
    }, [load, statusFilter, accessFilter])
  );

  const applyFilters = (status: StatusFilter, access: AccessFilter) => {
    setStatusFilter(status);
    setAccessFilter(access);
    setLoading(true);
    load(status, access);
  };

  const toggleAccessLevel = (post: AdminPost) => {
    const next: AccessLevel = post.access_level === 'premium' ? 'free' : 'premium';
    const goingFree = next === 'free';
    Alert.alert(
      goingFree ? 'Make this free?' : 'Make this premium?',
      goingFree
        ? 'Anyone will be able to watch it. This also unlocks the video on Cloudflare so free playback works — if that step fails, nothing is changed.'
        : 'Only subscribers, and people you grant access to, will be able to watch it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: goingFree ? 'Make free' : 'Make premium',
          onPress: async () => {
            setActingId(post.id);
            try {
              await AdminContentService.setPostAccessLevel(post.id, next);
              setPosts(prev => prev.map(p => (p.id === post.id ? { ...p, access_level: next } : p)));
            } catch (err: any) {
              Alert.alert('Not changed', err?.message ?? 'Could not change the access level.');
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  };

  const togglePublished = async (post: AdminPost) => {
    const next: AdminPostStatus = post.status === 'approved' ? 'draft' : 'approved';
    setActingId(post.id);
    try {
      await AdminContentService.setPostStatus(post.id, next);
      setPosts(prev => prev.map(p => (p.id === post.id ? { ...p, status: next } : p)));
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not change the status.');
    } finally {
      setActingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.headerBack} activeOpacity={0.7}>
            <Text style={styles.headerBackTxt}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Content</Text>
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
        <Text style={styles.headerTitle}>Content</Text>
        <TouchableOpacity onPress={() => router.push('/admin/upload')} style={styles.headerAction} activeOpacity={0.7}>
          <Text style={styles.headerActionTxt}>Upload</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, statusFilter === f.key && styles.filterTabActive]}
            onPress={() => applyFilters(f.key, accessFilter)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, statusFilter === f.key && styles.filterTabTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {ACCESS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, accessFilter === f.key && styles.filterTabActive]}
            onPress={() => applyFilters(statusFilter, f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, accessFilter === f.key && styles.filterTabTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color="#FF6B00" size="large" style={{ marginTop: 60 }} />
      ) : posts.length === 0 ? (
        <View style={styles.emptyState}><Text style={styles.emptyText}>No content matches these filters</Text></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
          {posts.map(post => {
            const isActing = actingId === post.id;
            return (
              <View key={post.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.titleText} numberOfLines={1}>
                    {post.title || post.body?.slice(0, 40) || 'Untitled'}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: STATUS_COLORS[post.status] ?? '#666666' }]}>
                    <Text style={styles.badgeText}>{post.status.toUpperCase()}</Text>
                  </View>
                </View>

                <Text style={styles.metaText}>
                  {post.content_type}
                  {post.genre ? ` · ${post.genre}` : ''}
                  {post.duration_min ? ` · ${post.duration_min} min` : ''}
                </Text>
                <Text style={[styles.metaText, post.access_level === 'premium' && styles.premiumText]}>
                  {post.access_level === 'premium' ? 'Premium' : 'Free'}
                </Text>
                <Text style={styles.cardDate}>{new Date(post.created_at).toLocaleString()}</Text>

                <View style={styles.actionsWrap}>
                  <TouchableOpacity
                    style={styles.actionBtnGhost}
                    onPress={() => toggleAccessLevel(post)}
                    activeOpacity={0.7}
                    disabled={isActing}
                  >
                    {isActing
                      ? <ActivityIndicator color="#FFFFFF" size="small" />
                      : <Text style={styles.actionBtnGhostText}>
                          Make {post.access_level === 'premium' ? 'free' : 'premium'}
                        </Text>}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnGhost}
                    onPress={() => router.push(`/admin/post-access?postId=${post.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnGhostText}>Manage access</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={post.status === 'approved' ? styles.actionBtnWarn : styles.actionBtnPrimary}
                    onPress={() => togglePublished(post)}
                    activeOpacity={0.7}
                    disabled={isActing}
                  >
                    <Text style={post.status === 'approved' ? styles.actionBtnWarnText : styles.actionBtnPrimaryText}>
                      {post.status === 'approved' ? 'Unpublish' : 'Publish'}
                    </Text>
                  </TouchableOpacity>
                </View>
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
  safe: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    backgroundColor: '#0A0A0A', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#2A2A2A',
  },
  headerBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { color: '#FF6B00', fontSize: 28, fontWeight: '700', lineHeight: 28 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  headerAction: { minWidth: 32, alignItems: 'flex-end' },
  headerActionTxt: { color: '#FF6B00', fontSize: 14, fontWeight: '800' },
  filterScroll: { flexGrow: 0 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  filterTab: { backgroundColor: '#1C1C1C', borderWidth: 1, borderColor: '#2A2A2A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  filterTabActive: { backgroundColor: '#FF6B00', borderColor: '#FF6B00' },
  filterTabText: { color: '#999999', fontSize: 12, fontWeight: '700' },
  filterTabTextActive: { color: '#FFFFFF' },
  list: { paddingBottom: 12, paddingHorizontal: 16, paddingTop: 4 },
  card: { backgroundColor: '#1C1C1C', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', padding: 16, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 10 },
  titleText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '900', color: '#0A0A0A', letterSpacing: 0.5 },
  metaText: { fontSize: 13, color: '#999999', fontWeight: '500', marginBottom: 2 },
  premiumText: { color: '#f0b429', fontWeight: '700' },
  cardDate: { fontSize: 11, color: '#666666', fontWeight: '500', marginTop: 4 },
  actionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtnGhost: { backgroundColor: '#2A2A2A', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, minWidth: 92, alignItems: 'center' },
  actionBtnGhostText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  actionBtnPrimary: { backgroundColor: '#FF6B00', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  actionBtnPrimaryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  actionBtnWarn: { backgroundColor: '#f0b429', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  actionBtnWarnText: { color: '#0A0A0A', fontSize: 12, fontWeight: '800' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, color: '#999999', fontWeight: '600', textAlign: 'center' },
});
