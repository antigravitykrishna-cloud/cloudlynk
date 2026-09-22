import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, RefreshControl } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PressScale } from '../../components/Press';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { CloudlynkLogo } from '../../components/CloudlynkLogo';
import { useAuth } from '../../hooks/useAuth';
import { PostService, GuestChannelPost } from '../../lib/posts';
import { Colors } from '../../constants/theme';
import { ListSkeleton } from '../../components/Skeleton';
import { Icon } from '../../components/Icon';

// The Feed tab: newest content from the channels you have joined -- the
// client's reference flow.
//
//   guest                     -> "Join channels to get content here!"
//   signed in, joined nothing -> the same, with a way to the channels
//   joined channels           -> their newest posts, premium ones included
//
// Anyone signed in can join a public channel (v81); watching premium needs a
// plan. So premium titles are listed with a lock, and tapping one goes
// straight to the plans. Tapping anything else opens its channel, where the
// existing playback gates apply.

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
  // "Nothing here yet" and "we could not reach the server" are different
  // things to tell someone, and only one of them is worth retrying.
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      // A guest has joined nothing, so there is nothing to fetch.
      setItems(user?.id ? await PostService.getJoinedFeedPosts(user.id) : []);
      setLoadFailed(false);
    } catch (err) {
      if (__DEV__) console.error('Feed load error:', err);
      // Keep whatever is already listed. Blanking a working feed because a
      // background refresh failed loses the user their place for no gain.
      setLoadFailed(true);
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

  const isLocked = (item: FeedItem) => item.access_level === 'premium' && !isPaidUser;

  const openItem = (item: FeedItem) => {
    if (isLocked(item)) {
      router.push('/premium');
      return;
    }
    router.push({ pathname: '/(tabs)/channels/[id]', params: { id: item.channel_id } });
  };

  // The empty state's next step: sign-in comes later, when they join.
  const emptyAction = {
    hint: user?.id
      ? 'Join the channels you like. Their newest videos show up here.'
      : 'Browse channels and join the ones you like. Their newest videos show up here.',
    label: 'Browse channels',
    go: () => router.push('/(tabs)/channels'),
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
          <Animated.View entering={FadeInDown.duration(280)} style={styles.emptyState}>
            <CloudlynkLogo size={72} />
            <Text style={styles.emptyText}>
              {loadFailed ? "Couldn't load the feed" : 'Join channels to get content here!'}
            </Text>
            <Text style={styles.emptyHint}>
              {loadFailed ? 'Check your connection and try again.' : emptyAction.hint}
            </Text>
            <PressScale
              style={styles.retryBtn}
              onPress={loadFailed ? onRefresh : emptyAction.go}
              haptic="light"
              accessibilityRole="button"
            >
              <Text style={styles.retryBtnText}>{loadFailed ? 'Try again' : emptyAction.label}</Text>
            </PressScale>
          </Animated.View>
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandBlue} />}
        >
          {items.map((item, idx) => {
            const thumb = item.thumbnail_url ? PostService.getMediaPublicUrl(item.thumbnail_url) : null;
            const locked = isLocked(item);

            return (
              // Rows arrive with a short stagger instead of the whole list
              // appearing at once. 45ms apart, capped at 8 so a long list does
              // not make the last row wait half a second. Capping matters more
              // than the interval: an uncapped stagger looks broken on scroll.
              <Animated.View key={item.id} entering={FadeInDown.delay(Math.min(idx, 8) * 45).duration(260)}>
              <PressScale
                style={styles.card}
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
                </View>

                <Icon name="chevron-right" size={16} color={Colors.textMuted} />
              </PressScale>
              </Animated.View>
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
  cardBody: { flex: 1 },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  cardMeta: { color: Colors.textSecondary, fontSize: 12, fontWeight: '500', marginTop: 4 },
  lockBadge: {
    position: 'absolute', top: 6, right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center',
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 20, color: Colors.text, fontWeight: '700', marginTop: 20, textAlign: 'center', letterSpacing: -0.3 },
  emptyHint: { fontSize: 14, color: Colors.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  retryBtn: { marginTop: 22, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 999, backgroundColor: Colors.brandBlue },
  retryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
