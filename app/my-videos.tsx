import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/Icon';

interface MyPost {
  id: string;
  channel_id: string;
  channel_name: string | null;
  title: string | null;
  content_type: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  status: string;
  rejection_note: string | null;
  created_at: string;
  approved_at: string | null;
}

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'approved': return '#2ED47A';
    case 'pending': return '#FFB347';
    case 'rejected': return Colors.brand;
    default: return Colors.textMuted;
  }
}

/** User-facing page showing all their own channel_posts submissions with status filter tabs. */
export default function MyVideosScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<FilterTab>('pending');
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    if (!user) return;
    try {
      const statusParam = activeTab === 'all' ? null : activeTab;
      const { data, error } = await supabase.rpc('get_my_channel_posts', {
        p_status: statusParam,
      });
      if (error) throw error;
      setPosts((data ?? []) as MyPost[]);
    } catch (err) {
      if (__DEV__) console.error('fetchPosts error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, activeTab]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchPosts();
  }, [fetchPosts]));

  const handleTapPost = async (post: MyPost) => {
    if (!post.video_url) return;
    try {
      await Linking.openURL(post.video_url);
    } catch {
      // ignore
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backTxt}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Videos</Text>
        <View style={{ width: 80 }} />
      </View>

      {/* Tab strip */}
      <View style={styles.tabStrip}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => { setActiveTab(tab.key); setLoading(true); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.brand} size="large" style={{ marginTop: 60 }} />
      ) : posts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {activeTab === 'all'
              ? 'No video submissions yet.'
              : `No ${activeTab} submissions.`}
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {posts.map(post => (
            <TouchableOpacity
              key={post.id}
              style={styles.card}
              onPress={() => handleTapPost(post)}
              activeOpacity={post.video_url ? 0.7 : 1}
              disabled={!post.video_url}
            >
              <View style={styles.thumb}>
                <Icon name={post.thumbnail_url ? 'film' : 'video'} size={26} color={Colors.textMuted} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>{post.title ?? 'Untitled'}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {post.channel_name ?? 'Unknown channel'}
                  {post.content_type ? ` · ${post.content_type}` : ''}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(post.status) + '18' }]}>
                  <Text style={[styles.statusBadgeText, { color: getStatusColor(post.status) }]}>
                    {post.status.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.cardDate}>Submitted {formatDate(post.created_at)}</Text>
                {post.status === 'approved' && post.approved_at && (
                  <Text style={[styles.cardDate, { color: '#2ED47A' }]}>
                    Approved on {formatDate(post.approved_at)}
                  </Text>
                )}
                {post.status === 'rejected' && post.rejection_note && (
                  <Text style={[styles.cardDate, { color: Colors.brand }]}>
                    {post.rejection_note}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { backgroundColor: Colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { width: 80 },
  backTxt: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  tabStrip: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 16 },
  tab: { paddingVertical: 12, paddingHorizontal: 14, marginRight: 4 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.brand },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: Colors.brand, fontWeight: '800' },
  list: { paddingVertical: 8 },
  card: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: Colors.border, gap: 12 },
  thumb: { width: 80, height: 110, borderRadius: 8, backgroundColor: Colors.surfaceHover, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  cardMeta: { fontSize: 12, color: Colors.textMuted, fontWeight: '500', marginBottom: 6 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginBottom: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  cardDate: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
});
