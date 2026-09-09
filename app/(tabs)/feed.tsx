import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { showAlert } from '../../components/Feedback';
import { CloudlynkLogo } from '../../components/CloudlynkLogo';
import { useAuth } from '../../hooks/useAuth';
import { PostService, GuestChannelPost } from '../../lib/posts';
import { Colors } from '../../constants/theme';
import { ListSkeleton } from '../../components/Skeleton';
import { Icon } from '../../components/Icon';

// The Feed tab: newest approved content across every public channel, for
// guests and signed-in users alike.
//
// Deliberately NOT membership-scoped. FeedService.getHomeFeed exists and does
// that, but it returns [] the moment someone has joined nothing — which is
// every guest and every new account, i.e. exactly the people this tab has to
// convince. A chronological public feed is never empty, and channels the user
// has joined surface in it anyway.
//
// Guests reach the same rows through channel_posts_select_anon (v61/v66),
// which already restricts to approved posts in public active channels and
// withholds video_url at the column grant. Premium rows are visible here on
// purpose: the locked catalogue is the reason to subscribe. Nothing on this
// screen plays anything — tapping routes to the channel, where the existing
// gates decide what happens next.

type FeedItem = GuestChannelPost;

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function subtitleFor(item: FeedItem): string {
  const bits: string[] = [];
  if (item.genre) bits.push(item.genre);
  if (item.content_type && item.content_type !== 'post') bits.push(item.content_type);
  if (item.duration_min) bits.push(`${item.duration_min} min`);
  bits.push(timeAgo(item.created_at));
  return bits.join(' · ');
}

export default function FeedScreen() {
  const { user, isPaidUser } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = user?.id
        ? ((await PostService.getExplorePosts(user.id, 'latest')) as unknown as FeedItem[])
        : await PostService.getGuestExplorePosts('latest');
      setItems(data.slice(0, 60));
    } catch (err) {
      if (__DEV__) console.error('Feed load error:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openItem = (item: FeedItem) => {
    const locked = item.access_level === 'premium' && !isPaidUser;
    if (locked) {
      if (!user?.id) {
        showAlert(
          'Create an account first',
          'This one is premium. Sign in — guest, Google or email — then subscribe to watch it in full.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Continue', onPress: () => router.push('/(auth)/login') },
          ],
        );
      } else {
        showAlert(
          'Premium content',
          'Subscribe to watch this in full. Your subscription unlocks every premium post while it is active.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => router.push('/premium') },
          ],
        );
      }
      return;
    }
    router.push({ pathname: '/(tabs)/channels/[id]', params: { id: item.channel_id } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        <CloudlynkLogo size={28} />
      </View>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : items.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandBlue} />}
        >
          <View style={styles.emptyState}>
            <CloudlynkLogo size={48} />
            <Text style={styles.emptyText}>Nothing here yet</Text>
            <Text style={styles.emptyHint}>
              New content from public channels shows up here as soon as it is approved.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandBlue} />}
        >
          {items.map(item => {
            const thumb = item.thumbnail_url ? PostService.getMediaPublicUrl(item.thumbnail_url) : null;
            const locked = item.access_level === 'premium' && !isPaidUser;

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => openItem(item)}
              >
                <View style={styles.thumbWrap}>
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Icon name="film" size={22} color={Colors.textMuted} />
                    </View>
                  )}
                  {locked && (
                    <View style={styles.lockBadge}>
                      <Icon name="lock" size={12} color="#FFFFFF" />
                    </View>
                  )}
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title?.trim() || 'Untitled'}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {subtitleFor(item)}
                  </Text>
                  {locked && <Text style={styles.lockedNote}>Premium · subscribe to watch</Text>}
                </View>

                <Icon name="chevron-right" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { color: '#ffffff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: 12, borderWidth: 0.5, borderColor: Colors.border,
    padding: 10, marginBottom: 10,
  },
  thumbWrap: { width: 96, height: 64, borderRadius: 8, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%', borderRadius: 8 },
  thumbFallback: { backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  lockBadge: {
    position: 'absolute', top: 6, right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  cardMeta: { color: Colors.textSecondary, fontSize: 12, fontWeight: '500', marginTop: 4 },
  lockedNote: { color: '#e3b341', fontSize: 12, fontWeight: '700', marginTop: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, color: Colors.text, fontWeight: '600', marginTop: 16 },
  emptyHint: { fontSize: 14, color: Colors.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
});
