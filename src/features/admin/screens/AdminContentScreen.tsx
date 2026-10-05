import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/components/ui/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  AdminContentService,
  AdminPost,
  AdminPostStatus,
} from '@/features/admin/api/adminContentApi';
import { AccessLevel } from '@/features/content/api/postsApi';
import { Colors } from '@/theme';

// Admin content list: everything published, filterable by status and access level. Access level can
// be changed here after upload. The isAdmin checks are UX only -- every write is an RPC that re-
// checks is_admin.

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
  draft: Colors.textSecondary,
  pending: Colors.gold,
  approved: Colors.success,
  rejected: Colors.danger,
  removed: Colors.textMuted,
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
      // A moderation queue that renders "nothing here" after a failed
      // fetch is worse than one that errors: the admin concludes there is
      // nothing to review and stops checking, while the queue fills up.
      showAlert(
        'Could not load content',
        err instanceof Error ? err.message : 'Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(statusFilter, accessFilter);
    }, [load, statusFilter, accessFilter]),
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
    showAlert(
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
              setPosts(prev =>
                prev.map(p => (p.id === post.id ? { ...p, access_level: next } : p)),
              );
            } catch (err: any) {
              showAlert('Not changed', err?.message ?? 'Could not change the access level.');
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
      showAlert('Error', err?.message ?? 'Could not change the status.');
    } finally {
      setActingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/profile')}
            style={styles.headerBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.headerBackTxt}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Content</Text>
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
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/profile')}
          style={styles.headerBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.headerBackTxt}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Content</Text>
        <TouchableOpacity
          onPress={() => router.push('/admin/upload')}
          style={styles.headerAction}
          activeOpacity={0.7}
        >
          <Text style={styles.headerActionTxt}>Upload</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, statusFilter === f.key && styles.filterTabActive]}
            onPress={() => applyFilters(f.key, accessFilter)}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.filterTabText, statusFilter === f.key && styles.filterTabTextActive]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {ACCESS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, accessFilter === f.key && styles.filterTabActive]}
            onPress={() => applyFilters(statusFilter, f.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.filterTabText, accessFilter === f.key && styles.filterTabTextActive]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} size="large" style={{ marginTop: 60 }} />
      ) : posts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No content matches these filters</Text>
        </View>
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
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: STATUS_COLORS[post.status] ?? Colors.textMuted },
                    ]}
                  >
                    <Text style={styles.badgeText}>{post.status.toUpperCase()}</Text>
                  </View>
                </View>

                <Text style={styles.metaText}>
                  {post.content_type}
                  {post.genre ? ` · ${post.genre}` : ''}
                  {post.duration_min ? ` · ${post.duration_min} min` : ''}
                </Text>
                <Text
                  style={[styles.metaText, post.access_level === 'premium' && styles.premiumText]}
                >
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
                    {isActing ? (
                      <ActivityIndicator color={Colors.text} size="small" />
                    ) : (
                      <Text style={styles.actionBtnGhostText}>
                        Make {post.access_level === 'premium' ? 'free' : 'premium'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnGhost}
                    onPress={() => router.push(`/admin/post-access?postId=${post.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnGhostText}>Manage access</Text>
                  </TouchableOpacity>

                  {/* Edits in place, so the post keeps its id and therefore
                      every content_access_grants row pointing at it. The
                      remove-and-re-upload workaround this replaces silently
                      orphaned them. */}
                  <TouchableOpacity
                    style={styles.actionBtnGhost}
                    onPress={() => router.push(`/admin/edit-post?postId=${post.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnGhostText}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={
                      post.status === 'approved' ? styles.actionBtnWarn : styles.actionBtnPrimary
                    }
                    onPress={() => togglePublished(post)}
                    activeOpacity={0.7}
                    disabled={isActing}
                  >
                    <Text
                      style={
                        post.status === 'approved'
                          ? styles.actionBtnWarnText
                          : styles.actionBtnPrimaryText
                      }
                    >
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
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { color: Colors.brandBlue, fontSize: 28, fontWeight: '700', lineHeight: 28 },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: '800' },
  headerAction: { minWidth: 32, alignItems: 'flex-end' },
  headerActionTxt: { color: Colors.brandBlue, fontSize: 14, fontWeight: '800' },
  filterScroll: { flexGrow: 0 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  filterTab: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  filterTabActive: { backgroundColor: Colors.brandBlue, borderColor: Colors.brandBlue },
  filterTabText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  filterTabTextActive: { color: Colors.text },
  list: { paddingBottom: 12, paddingHorizontal: 16, paddingTop: 4 },
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 10,
  },
  titleText: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 11, fontWeight: '900', color: Colors.bg, letterSpacing: 0.5 },
  metaText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginBottom: 2 },
  premiumText: { color: Colors.gold, fontWeight: '700' },
  cardDate: { fontSize: 11, color: Colors.textMuted, fontWeight: '500', marginTop: 4 },
  actionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtnGhost: {
    backgroundColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    minWidth: 92,
    alignItems: 'center',
  },
  actionBtnGhostText: { color: Colors.text, fontSize: 12, fontWeight: '700' },
  actionBtnPrimary: {
    backgroundColor: Colors.brandBlue,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  actionBtnPrimaryText: { color: Colors.text, fontSize: 12, fontWeight: '800' },
  actionBtnWarn: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  actionBtnWarnText: { color: Colors.bg, fontSize: 12, fontWeight: '800' },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
  },
  emptyText: { fontSize: 16, color: Colors.textSecondary, fontWeight: '600', textAlign: 'center' },
});
