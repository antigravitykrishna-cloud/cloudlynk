import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  StatusBar,
} from 'react-native';
import { showAlert } from '@/components/ui/Feedback';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/hooks/useAuth';
import { ChannelService, BlockService, CHANNEL_LIST_COLUMNS } from '@/lib/data/channels';
import { LoginSheet } from '@/components/auth/LoginSheet';
import { promptSaveAccount, guestTappedTitle } from '@/lib/auth/guest';
import { PostService, ChannelPost } from '@/lib/data/posts';
import { Database, supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { H, formatDuration } from '@/components/channel/shared';
import { DetailModal } from '@/components/channel/DetailModal';
import { GenreRow } from '@/components/channel/GenreRow';

// guards-allow-select-star
//
// Guests reach this screen; their path in load() names its columns (CHANNEL_LIST_COLUMNS,
// getGuestChannelPosts). Only the signed-in path uses select('*') -- see scripts/guards.mjs check
// 2.

const W = Dimensions.get('window').width;

const HERO_H = H * 0.52;

type Channel = Database['public']['Tables']['channels']['Row'];

// ── Main screen
export default function ChannelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isAdmin, isPaidUser, isGuest } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [signInSheet, setSignInSheet] = useState(false);

  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [grouped, setGrouped] = useState<Record<string, ChannelPost[]>>({});
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [selected, setSelected] = useState<ChannelPost | null>(null);

  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== user?.id) {
      setChannel(null);
      setPosts([]);
      setGrouped({});
      setIsMember(false);
      setSelected(null);
      setLoading(true);
    }
    prevUserIdRef.current = user?.id;
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      if (!user?.id) {
        // Guest: look, but not play. Named columns throughout -- anon is not
        // granted every column, and one it cannot read fails the whole
        // request rather than coming back null.
        const [{ data: ch, error: chErr }, guestPosts] = await Promise.all([
          supabase.from('channels').select(CHANNEL_LIST_COLUMNS).eq('id', id).maybeSingle(),
          PostService.getGuestChannelPosts(id),
        ]);
        if (chErr) throw chErr;
        setChannel(ch as unknown as Channel);
        setIsMember(false);
        const list = guestPosts as unknown as ChannelPost[];
        setPosts(list);
        setGrouped(PostService.groupByGenre(list));
        return;
      }

      const { data: ch } = await supabase.from('channels').select('*').eq('id', id).single();
      setChannel(ch as Channel);

      const { data: mem } = await supabase
        .from('channel_members')
        .select('role')
        .eq('channel_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      // Owners are implicitly members even without a channel_members row
      setIsMember(!!mem || (ch as Channel)?.owner_id === user.id);

      const entitled = isPaidUser || isAdmin;
      const [allPosts, blockedIds, previews] = await Promise.all([
        PostService.getChannelPosts(id, user.id),
        BlockService.getBlockedUserIds(user.id).catch(() => [] as string[]),
        // Without a plan, RLS returns this channel's free rows only. The
        // premium titles come from premium_preview (metadata, no video) so
        // the person can see what they would be paying for.
        entitled
          ? Promise.resolve([] as ChannelPost[])
          : PostService.getChannelPremiumPreviews(id)
              .then(r => r as unknown as ChannelPost[])
              .catch(() => [] as ChannelPost[]),
      ]);
      const seen = new Set(allPosts.map(p => p.id));
      const merged = [...allPosts, ...previews.filter(p => !seen.has(p.id))];
      const visiblePosts = blockedIds.length
        ? merged.filter(p => !blockedIds.includes(p.author_id))
        : merged;
      setPosts(visiblePosts);
      setGrouped(PostService.groupByGenre(visiblePosts));
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, isPaidUser, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Same rule as the Join button on the Channels tab: a guest gets the
  // sign-in sheet; a signed-in account joins a public channel without a plan
  // (v81) and is asked for one only when it tries to watch. A hidden channel
  // still needs a plan to join.
  const handleJoin = async () => {
    if (!id) return;
    if (!user?.id) {
      setSignInSheet(true);
      return;
    }
    // Guests cannot join channels.
    if (isGuest) {
      promptSaveAccount(router, 'join channels');
      return;
    }
    if (channel && !channel.is_public && !isPaidUser && !isAdmin && channel.owner_id !== user.id) {
      router.push('/premium');
      return;
    }
    setJoining(true);
    try {
      await ChannelService.joinChannel(id, user.id);
      setIsMember(true);
      await load();
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setJoining(false);
    }
  };

  // Tapping a title. Anyone can see what a channel has; watching needs the
  // right to. Everyone else goes straight to the plans, no dialog first, per
  // the client's reference flow. Free titles still play for a signed-in
  // user; a guest is asked to pick a plan (and sign in) for any title.
  const openPost = (item: ChannelPost) => {
    // Guests (signed out or guest account) see previews only.
    const canWatch =
      !isGuest &&
      (isPaidUser ||
        isAdmin ||
        channel?.owner_id === user?.id ||
        (!!user?.id && item.access_level !== 'premium'));
    if (!canWatch) {
      if (isGuest) guestTappedTitle(router, isPaidUser);
      else router.push('/premium');
      return;
    }
    setSelected(item);
  };

  const hero = grouped['Featured']?.[0] ?? null;
  const heroThumb = hero?.thumbnail_url ? PostService.getMediaPublicUrl(hero.thumbnail_url) : null;
  const groupKeys = Object.keys(grouped);
  const hasContent = posts.filter(p => p.status === 'approved').length > 0;
  const hasPendingContent =
    posts.filter(p => p.status === 'pending' || p.status === 'draft').length > 0;
  const pendingPosts = posts.filter(p => p.status === 'pending' || p.status === 'draft');

  if (loading) {
    return (
      <View style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#2E7DFF" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2E7DFF" />
        }
      >
        <View style={[styles.hero, { height: HERO_H }]}>
          {heroThumb ? (
            <Image source={{ uri: heroThumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.heroPlaceholder]} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.5)', '#000']}
            style={StyleSheet.absoluteFill}
          />

          <TouchableOpacity
            style={[styles.heroBack, { top: insets.top + 8 }]}
            onPress={() => router.replace('/(tabs)/channels')}
          >
            <Text style={styles.heroBackTxt}>{'‹'}</Text>
          </TouchableOpacity>

          <View style={styles.heroBottom}>
            <Text style={styles.channelLabel}>{channel?.name ?? ''}</Text>
            {hero ? (
              <>
                <Text style={styles.heroTitle}>{hero.title}</Text>
                {!!hero.genre && (
                  <Text style={styles.heroGenre}>
                    {hero.genre}
                    {hero.release_year ? ` · ${hero.release_year}` : ''}
                    {hero.duration_min ? ` · ${formatDuration(hero.duration_min)}` : ''}
                  </Text>
                )}
                <View style={styles.heroActions}>
                  <TouchableOpacity style={styles.heroPlayBtn} onPress={() => openPost(hero)}>
                    <Text style={styles.heroPlayTxt}>{'▶  Play'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.heroInfoBtn} onPress={() => openPost(hero)}>
                    <Text style={styles.heroInfoTxt}>{'ⓘ  More Info'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.heroTitle}>{channel?.name}</Text>
                {!!channel?.description && channel.description !== channel?.name && (
                  <Text style={styles.heroGenre}>{channel.description}</Text>
                )}
              </>
            )}
            {!isMember && channel?.status === 'active' && (
              <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} disabled={joining}>
                {joining ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.joinTxt}>+ Join Channel</Text>
                )}
              </TouchableOpacity>
            )}
            {isMember && (
              <View style={styles.memberBadge}>
                <Text style={styles.memberTxt}>{'✓ Subscribed'}</Text>
              </View>
            )}
          </View>
        </View>

        {isAdmin && (
          <View style={styles.addBtnGroup}>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() =>
                router.push({ pathname: '/upload/add-content', params: { channelId: id } })
              }
            >
              <Text style={styles.addBtnTxt}>+ Add Content</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.queueBtn}
              onPress={() => router.push({ pathname: '/upload/queue', params: { channelId: id } })}
            >
              <Text style={styles.queueBtnTxt}>Upload Queue</Text>
            </TouchableOpacity>
          </View>
        )}

        {(isAdmin || channel?.owner_id === user?.id) && hasPendingContent && (
          <View style={styles.pendingSection}>
            <Text style={styles.pendingSectionTitle}>⏳ Pending Review</Text>
            {pendingPosts.map(post => (
              <View key={post.id} style={styles.pendingCard}>
                <Text style={styles.pendingCardTitle}>{post.title ?? 'Untitled'}</Text>
                <Text style={styles.pendingCardMeta}>
                  {post.content_type?.toUpperCase()} · Submitted for review
                </Text>
              </View>
            ))}
          </View>
        )}

        {!hasContent ? (
          <View style={styles.emptyState}>
            <Icon name="film" size={52} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No content yet</Text>
            <Text style={styles.emptyDesc}>New movies and series will appear here.</Text>
            {isAdmin && (
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() =>
                  router.push({ pathname: '/upload/add-content', params: { channelId: id } })
                }
              >
                <Text style={styles.emptyAddTxt}>Add First Content</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          groupKeys.map(g => <GenreRow key={g} genre={g} items={grouped[g]} onSelect={openPost} />)
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <DetailModal
        selected={selected}
        onClose={() => setSelected(null)}
        userId={user?.id}
        channelId={id}
      />
      <LoginSheet
        allowGuest={false}
        visible={signInSheet}
        onClose={() => setSignInSheet(false)}
        message="Sign in to join this channel. It only takes a moment."
        returnTo={id ? { pathname: '/(tabs)/channels/[id]', params: { id } } : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  hero: { width: W, position: 'relative', backgroundColor: Colors.brand },
  heroPlaceholder: { backgroundColor: Colors.brandLight },
  heroBack: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 22,
  },
  heroBackTxt: { fontSize: 26, color: '#fff', fontWeight: '700' },
  heroBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 24,
  },
  channelLabel: {
    fontSize: 12,
    color: Colors.brand,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 6,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  heroGenre: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 16 },
  heroActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  heroPlayBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  heroPlayTxt: { color: '#000', fontSize: 15, fontWeight: '800' },
  heroInfoBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  heroInfoTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  joinBtn: {
    backgroundColor: Colors.brand,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  joinTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  memberTxt: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '700' },
  addBtnGroup: { marginHorizontal: 16, marginTop: 20, gap: 8 },
  addBtn: {
    borderWidth: 1.5,
    borderColor: Colors.brand,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  addBtnTxt: { color: Colors.brand, fontSize: 14, fontWeight: '800' },
  queueBtn: {
    borderWidth: 1,
    borderColor: Colors.accentOrange,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.accentOrangeDim,
  },
  queueBtnTxt: { color: Colors.accentOrange, fontSize: 14, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 22, fontWeight: '900', color: Colors.text, marginBottom: 8 },
  emptyDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyAddBtn: {
    backgroundColor: Colors.brand,
    borderRadius: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  emptyAddTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  pendingSection: { marginHorizontal: 16, marginTop: 20 },
  pendingSectionTitle: { fontSize: 14, fontWeight: '700', color: '#FFC65C', marginBottom: 10 },
  pendingCard: {
    backgroundColor: '#1a1400',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#443300',
    padding: 12,
    marginBottom: 8,
  },
  pendingCardTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
  pendingCardMeta: { fontSize: 12, color: '#FFC65C', fontWeight: '600' },
});
