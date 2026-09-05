import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { PostService, ChannelPost } from '../lib/posts';
import { NotificationService } from '../lib/notifications';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { formatTimeAgo } from '../lib/storage';

type PendingChannel = {
  id: string; name: string; description: string | null;
  is_public: boolean; created_at: string; owner_id: string;
  owner?: { id: string; full_name: string | null; email: string };
};

export default function AdminScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [pendingChannels, setPendingChannels] = useState<PendingChannel[]>([]);
  const [pendingPosts, setPendingPosts] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'channels' | 'posts'>('channels');
  const [reviewing, setReviewing] = useState<string | null>(null);

  useEffect(() => {
    if (profile && !(profile as any).is_admin) { Alert.alert('Access denied'); router.replace('/(tabs)/profile'); }
  }, [profile, router]);

  const load = useCallback(async () => {
    try {
      const [channels, posts] = await Promise.all([PostService.getPendingChannels(), PostService.getPendingPosts()]);
      setPendingChannels(channels as PendingChannel[]);
      setPendingPosts(posts);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const approveChannel = async (ch: PendingChannel) => {
    setReviewing(ch.id);
    try {
      await PostService.approveChannel(ch.id);
      await NotificationService.channelApproved(ch.owner?.id ?? ch.owner_id, ch.name, ch.id);
      setPendingChannels(prev => prev.filter(c => c.id !== ch.id));
      Alert.alert('✓ Approved', `"${ch.name}" is live. Owner notified.`);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setReviewing(null); }
  };

  const rejectChannel = (ch: PendingChannel) => {
    Alert.alert('Reject?', `"${ch.name}" will be suspended.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        setReviewing(ch.id);
        try {
          await PostService.rejectChannel(ch.id);
          await NotificationService.channelRejected(ch.owner?.id ?? ch.owner_id, ch.name, ch.id);
          setPendingChannels(prev => prev.filter(c => c.id !== ch.id));
        } catch (err: any) { Alert.alert('Error', err.message); }
        finally { setReviewing(null); }
      }},
    ]);
  };

  const approvePost = async (post: ChannelPost) => {
    if (!profile?.id) return;
    setReviewing(post.id);
    try {
      await PostService.approvePost(post.id, profile.id);
      await NotificationService.postApproved(post.author_id, (post.channel as any)?.name ?? 'your channel', post.channel_id, post.id);
      setPendingPosts(prev => prev.filter(p => p.id !== post.id));
      Alert.alert('✓ Post approved', 'Author notified.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setReviewing(null); }
  };

  const rejectPost = (post: ChannelPost) => {
    if (!profile?.id) return;
    Alert.alert('Reject post?', 'Author will be notified.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        setReviewing(post.id);
        try {
          await PostService.rejectPost(post.id, profile.id, 'Does not meet content guidelines.');
          await NotificationService.postRejected(post.author_id, (post.channel as any)?.name ?? 'your channel', post.channel_id, post.id);
          setPendingPosts(prev => prev.filter(p => p.id !== post.id));
        } catch (err: any) { Alert.alert('Error', err.message); }
        finally { setReviewing(null); }
      }},
    ]);
  };

  const ChannelCard = ({ ch }: { ch: PendingChannel }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}><Text style={{ fontSize: 22 }}>{ch.is_public ? '🌐' : '🔐'}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{ch.name}</Text>
          <Text style={styles.cardMeta}>by {ch.owner?.full_name ?? ch.owner?.email ?? 'Unknown'} · {formatTimeAgo(ch.created_at)}</Text>
        </View>
      </View>
      {!!ch.description && <Text style={styles.cardDesc}>{ch.description}</Text>}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectChannel(ch)} disabled={reviewing === ch.id}>
          <Text style={styles.rejectTxt}>✕ Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.approveBtn} onPress={() => approveChannel(ch)} disabled={reviewing === ch.id}>
          {reviewing === ch.id ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.approveTxt}>✓ Approve</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  const PostCard = ({ post }: { post: ChannelPost }) => {
    const thumbPath = post.thumbnail_url ?? post.media_url;
    const mediaUrl = thumbPath ? PostService.getMediaPublicUrl(thumbPath) : null;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIcon, { backgroundColor: Colors.purpleDim }]}><Text style={{ fontSize: 18 }}>📝</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{post.title ?? post.body?.slice(0, 40) ?? 'Untitled'}</Text>
            <Text style={styles.cardMeta}>{post.author?.full_name ?? 'Unknown'} → #{(post.channel as any)?.name ?? '?'} · {formatTimeAgo(post.created_at)}</Text>
          </View>
        </View>
        {!!post.body && <Text style={styles.cardDesc} numberOfLines={4}>{post.body}</Text>}
        {!!mediaUrl && <Image source={{ uri: mediaUrl }} style={styles.postThumb} resizeMode="cover" />}
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectPost(post)} disabled={reviewing === post.id}>
            <Text style={styles.rejectTxt}>✕ Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.approveBtn} onPress={() => approvePost(post)} disabled={reviewing === post.id}>
            {reviewing === post.id ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.approveTxt}>✓ Approve</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)/profile')}><Text style={styles.backTxt}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <View style={{ width: 36 }} />
      </View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}><Text style={styles.summaryVal}>{pendingChannels.length}</Text><Text style={styles.summaryLbl}>Channels</Text></View>
        <View style={[styles.summaryItem, { borderLeftWidth: 0.5, borderLeftColor: Colors.border }]}><Text style={styles.summaryVal}>{pendingPosts.length}</Text><Text style={styles.summaryLbl}>Posts</Text></View>
      </View>
      <View style={styles.tabRow}>
        {(['channels', 'posts'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabTxt, activeTab === tab && styles.tabTxtActive]}>
              {tab === 'channels' ? `Channels (${pendingChannels.length})` : `Posts (${pendingPosts.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color={Colors.accent} style={{ marginTop: 60 }} /> : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}>
          {activeTab === 'channels'
            ? pendingChannels.length === 0
              ? <View style={styles.emptyState}><Text style={{ fontSize: 44, marginBottom: Spacing.md }}>✅</Text><Text style={styles.emptyTitle}>All caught up</Text><Text style={styles.emptyDesc}>No channels waiting.</Text></View>
              : pendingChannels.map(ch => <ChannelCard key={ch.id} ch={ch} />)
            : pendingPosts.length === 0
              ? <View style={styles.emptyState}><Text style={{ fontSize: 44, marginBottom: Spacing.md }}>✅</Text><Text style={styles.emptyTitle}>All caught up</Text><Text style={styles.emptyDesc}>No posts waiting.</Text></View>
              : pendingPosts.map(post => <PostCard key={post.id} post={post} />)
          }
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { fontSize: 26, color: Colors.accent, fontWeight: FontWeight.bold },
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.extrabold, color: Colors.text, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', margin: Spacing.lg, backgroundColor: Colors.card, borderRadius: Radius.xl, borderWidth: 0.5, borderColor: Colors.border },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.lg },
  summaryVal: { fontSize: FontSize.xxxl, fontWeight: FontWeight.extrabold, color: Colors.accent },
  summaryLbl: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold, marginTop: 4 },
  tabRow: { flexDirection: 'row', marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: Colors.card, borderRadius: Radius.md, padding: 3, borderWidth: 0.5, borderColor: Colors.border },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm },
  tabActive: { backgroundColor: Colors.surface },
  tabTxt: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted },
  tabTxtActive: { color: Colors.text },
  card: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: Colors.card, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 0.5, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm, alignItems: 'center' },
  cardIcon: { width: 46, height: 46, borderRadius: Radius.md, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: Colors.border },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.extrabold, color: Colors.text },
  cardMeta: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold, marginTop: 2 },
  cardDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold, lineHeight: 20, marginBottom: Spacing.md },
  postThumb: { width: '100%', height: 160, borderRadius: Radius.lg, marginBottom: Spacing.md },
  cardActions: { flexDirection: 'row', gap: Spacing.sm },
  rejectBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.dangerDim, borderWidth: 0.5, borderColor: 'rgba(248,81,73,0.3)', alignItems: 'center' },
  rejectTxt: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.danger },
  approveBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.accent, alignItems: 'center' },
  approveTxt: { fontSize: FontSize.md, fontWeight: FontWeight.extrabold, color: '#000' },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: Spacing.xxxl },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
