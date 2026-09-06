import { CloudlynkLogo } from '../../components/CloudlynkLogo';
import { VideoPlayerOverlay } from '../../components/VideoPlayerOverlay';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, Modal, ActivityIndicator, RefreshControl,
  Dimensions, Share, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useRecordProgress, getSavedPosition } from '../../hooks/useWatchHistory';
import { PostService, ChannelPost } from '../../lib/posts';
import { StreamService } from '../../lib/stream';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { Colors } from '../../constants/theme';

const { width: W, height: H } = Dimensions.get('window');
const COLS = 3;
const GAP = 2;
const TILE = Math.floor((W - GAP * (COLS + 1)) / COLS);

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'popular', label: 'Popular' },
  { key: 'most_watched', label: 'Most watched' },
  { key: 'latest', label: 'Latest' },
  { key: 'most_searched', label: 'Most searched' },
];

const VideoTile = memo(({ item, onPress }: { item: ChannelPost; onPress: () => void }) => {
  const thumb = item.thumbnail_url ? PostService.getMediaPublicUrl(item.thumbnail_url) : null;
  const hasVideo = !!item.video_url || !!item.media_url;
  const isTall = item.id.charCodeAt(0) % 4 === 0;
  return (
    <TouchableOpacity style={[styles.tile, isTall && styles.tileTall]} onPress={onPress} activeOpacity={0.85}>
      {thumb
        ? <Image source={{ uri: thumb }} style={styles.tileImg} resizeMode="cover" />
        : <View style={[styles.tileImg, styles.tilePlaceholder]}>
            <Text style={{ fontSize: 32 }}>
              {item.content_type === 'short' ? '🎞️' : item.content_type === 'movie' ? '🎬' : item.content_type === 'series' ? '📺' : '📝'}
            </Text>
          </View>
      }
      {hasVideo && <View style={styles.tileScrim} />}
      {hasVideo && (
        <View style={styles.playIcon}>
          <Text style={styles.playIconText}>{'▶'}</Text>
        </View>
      )}
      {isTall && !!item.title && (
        <View style={styles.tileTitleWrap}>
          <Text style={styles.tileTitle} numberOfLines={1}>{item.title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});
VideoTile.displayName = 'VideoTile';

type SectionItem = { sectionKey: string; items: ChannelPost[] };

const SectionCard = memo(({ item, isShorts, onPress }: {
  item: ChannelPost; isShorts: boolean; onPress: () => void;
}) => {
  const thumb = item.thumbnail_url ? PostService.getMediaPublicUrl(item.thumbnail_url) : null;
  return (
    <TouchableOpacity
      style={isShorts ? styles.shortCard : styles.sectionCard}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {thumb ? (
        <Image
          source={thumb}
          style={isShorts ? styles.shortImg : styles.sectionCardImg}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[isShorts ? styles.shortImg : styles.sectionCardImg, styles.shortPlaceholder]}>
          <Text style={{ fontSize: isShorts ? 24 : 28 }}>
            {item.content_type === 'movie' ? '🎬' : item.content_type === 'series' ? '📺' : item.content_type === 'short' ? '🎞️' : '📝'}
          </Text>
        </View>
      )}
      <Text style={isShorts ? styles.shortTitle : styles.sectionCardTitle} numberOfLines={2}>
        {item.title ?? 'Untitled'}
      </Text>
    </TouchableOpacity>
  );
});
SectionCard.displayName = 'SectionCard';

const SectionBlock = memo(({ sectionKey, items, onSelect }: {
  sectionKey: string; items: ChannelPost[]; onSelect: (item: ChannelPost) => void;
}) => {
  const isShorts = sectionKey === 'Shorts';
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.shortsHeader}>
        <Text style={styles.shortsTitle}>{sectionKey}</Text>
        {isShorts && <View style={styles.shortsBadge}><Text style={styles.shortsBadgeText}>FREE</Text></View>}
      </View>
      <FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.sectionRow}
        initialNumToRender={5}
        maxToRenderPerBatch={8}
        windowSize={3}
        renderItem={({ item }) => (
          <SectionCard
            item={item}
            isShorts={isShorts}
            onPress={() => onSelect(item)}
          />
        )}
      />
    </View>
  );
});
SectionBlock.displayName = 'SectionBlock';

const DetailModal = memo(({ selected, onClose, userId }: {
  selected: ChannelPost | null; onClose: () => void; userId: string | undefined;
}) => {
  const insets = useSafeAreaInsets();
  const [isPlaying, setIsPlaying] = useState(false);
  // Premium (access_level='premium') Stream videos need a server-minted
  // signed URL — see lib/stream.ts. Free videos and R2 post-videos resolve
  // synchronously with no extra network call.
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const hasVideoSource = !!selected?.video_url
    || !!(selected?.media_url && selected.media_type === 'video');

  useEffect(() => {
    let cancelled = false;
    setVideoError(null);
    if (selected?.video_url) {
      if (selected.access_level === 'premium') {
        setVideoUrl(null);
        setVideoLoading(true);
        StreamService.getSignedPlaybackUrl(selected.id)
          .then((url) => { if (!cancelled) setVideoUrl(url); })
          .catch((err: any) => { if (!cancelled) setVideoError(err?.message ?? "This video isn't available."); })
          .finally(() => { if (!cancelled) setVideoLoading(false); });
      } else {
        // v57: see the matching comment in app/(tabs)/channels/[id].tsx.
        setVideoLoading(true);
        StreamService.resolveFreePlaybackUrl(selected.id, selected.video_url)
          .then((url) => { if (!cancelled) setVideoUrl(url); })
          .catch((err: any) => { if (!cancelled) setVideoError(err?.message ?? "This video isn't available."); })
          .finally(() => { if (!cancelled) setVideoLoading(false); });
      }
    } else if (selected?.media_url && selected.media_type === 'video') {
      setVideoUrl(PostService.getMediaPublicUrl(selected.media_url));
    } else {
      setVideoUrl(null);
    }
    return () => { cancelled = true; };
  }, [selected?.id, selected?.video_url, selected?.access_level, selected?.media_url, selected?.media_type]);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 5;
  });

  const { updatePosition, saveProgress } = useRecordProgress(userId, selected?.id, isPlaying);

  const timeUpdate = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  useEffect(() => {
    if (timeUpdate.currentTime > 0) {
      updatePosition(timeUpdate.currentTime, player.duration);
    }
  }, [timeUpdate.currentTime, player.duration, updatePosition]);

  useEffect(() => {
    if (!selected?.id || !userId) return;
    getSavedPosition(userId, selected.id).then(pos => {
      if (pos > 0) player.currentTime = pos;
    });
  }, [selected?.id, userId, player]);

  useEffect(() => { setIsPlaying(false); }, [selected]);

  useEffect(() => {
    if (isPlaying) player.play();
    else { player.pause(); saveProgress(); }
  }, [isPlaying, player, saveProgress]);

  if (!selected) return null;
  const thumb = selected.thumbnail_url ? PostService.getMediaPublicUrl(selected.thumbnail_url) : null;

  const handleShare = async () => {
    try {
      await Share.share({ message: selected.title ?? 'Check this out on Cloudlynk' });
    } catch {}
  };

  return (
    <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.detailModal}>
        <View style={styles.detailHero}>
          {thumb
            ? <Image source={{ uri: thumb }} style={styles.detailHeroImg} resizeMode="cover" />
            : <View style={[styles.detailHeroImg, styles.detailHeroPlaceholder]}><Text style={{ fontSize: 64 }}>{'🎬'}</Text></View>
          }
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.92)']} style={StyleSheet.absoluteFill} />
          <TouchableOpacity style={[styles.detailClose, { top: insets.top + 12 }]} onPress={onClose}>
            <Text style={styles.detailCloseTxt}>{'✕'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
          <View style={styles.detailBadgeRow}>
            <View style={styles.detailBadge}>
              <Text style={styles.detailBadgeTxt}>{selected.content_type.toUpperCase()}</Text>
            </View>
            {!!selected.genre && <View style={styles.detailBadge}><Text style={styles.detailBadgeTxt}>{selected.genre}</Text></View>}
            {!!selected.duration_min && <View style={styles.detailBadge}><Text style={styles.detailBadgeTxt}>{selected.duration_min}m</Text></View>}
          </View>
          <Text style={styles.detailTitle}>{selected.title ?? 'Untitled'}</Text>
          {!!selected.body && <Text style={styles.detailDesc}>{selected.body}</Text>}

          {hasVideoSource ? (
            videoError ? (
              <View style={[styles.playBtn, { backgroundColor: '#9FB0C9' }]}>
                <Text style={[styles.playBtnTxt, { color: '#6B7C97', fontSize: 13 }]}>{videoError}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.playBtn, videoLoading && { opacity: 0.6 }]}
                onPress={() => { if (videoUrl) setIsPlaying(true); }}
                disabled={videoLoading || !videoUrl}
              >
                {videoLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.playBtnTxt}>{'▶  Play Video'}</Text>}
              </TouchableOpacity>
            )
          ) : (
            <View style={[styles.playBtn, { backgroundColor: '#9FB0C9' }]}>
              <Text style={[styles.playBtnTxt, { color: '#6B7C97' }]}>{'No Video Available'}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnTxt}>{'↗  Share'}</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
        {isPlaying && videoUrl && (
          <VideoPlayerOverlay player={player} onClose={() => setIsPlaying(false)} postId={selected.id} postTitle={selected.title ?? undefined} />
        )}
      </View>
    </Modal>
  );
});
DetailModal.displayName = 'DetailModal';

export default function ExploreScreen() {
  const { user, isPaidUser, isAdmin } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<ChannelPost[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<ChannelPost | null>(null);

  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== user?.id) {
      setPosts([]);
      setFilteredPosts([]);
      setSelected(null);
      setLoading(true);
    }
    prevUserIdRef.current = user?.id;
  }, [user?.id]);

  // A guest can browse the catalogue but not open a post: the row they were
  // served has no video_url, so a detail view would be a dead player. Ask for
  // the account here instead, where the intent is obvious and the prompt can
  // say what it unlocks.
  const handleSelect = useCallback((item: ChannelPost) => {
    if (!user?.id) {
      Alert.alert(
        'Sign in to watch',
        item.access_level === 'premium'
          ? 'Create a free account to watch. This title is part of Cloudlynk Premium.'
          : 'Create a free account to watch this. It only takes a minute, and you get 15 GB of storage too.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign in', onPress: () => router.push('/(auth)/login') },
          { text: 'Sign up free', onPress: () => router.push('/(auth)/signup') },
        ],
      );
      return;
    }
    setSelected(item);
    PostService.recordView(item.id);
  }, [user?.id, router]);

  const load = useCallback(async () => {
    try {
      // v61: signed-out visitors browse too. getGuestExplorePosts names its
      // columns explicitly because `anon` is not granted video_url — asking
      // for it with select('*') would fail the whole query rather than return
      // a null, and the guest would see an empty Explore with no clue why.
      const all = user?.id
        ? await PostService.getExplorePosts(user.id, activeFilter as any)
        : await PostService.getGuestExplorePosts(activeFilter as any);
      setPosts(all as ChannelPost[]);
    } catch (err) {
      if (__DEV__) console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeFilter]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  const grouped = useMemo(() => PostService.groupByGenre(posts), [posts]);

  const sectionOrder = useMemo(() => {
    const fixed = ['Featured', 'Movies', 'Shorts'];
    const seriesKeys = Object.keys(grouped).filter(k => k.startsWith('Series: ') || k === 'Web Series');
    const dynamic = Object.keys(grouped).filter(k => !fixed.includes(k) && !seriesKeys.includes(k));
    // Order: Featured → Movies → named Series rows → Web Series → Shorts → genre/other
    return ['Featured', 'Movies', ...seriesKeys, 'Shorts', ...dynamic]
      .filter(k => grouped[k] && grouped[k].length > 0);
  }, [grouped]);

  const sortSection = useCallback((items: ChannelPost[]): ChannelPost[] => {
    if (activeFilter === 'latest') {
      return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (activeFilter === 'popular' || activeFilter === 'most_watched' || activeFilter === 'most_searched') {
      return [...items].sort((a, b) => ((b as any).view_count ?? 0) - ((a as any).view_count ?? 0));
    }
    return items;
  }, [activeFilter]);

  // Flat array for the outer FlatList — each element is one section row
  const sectionData = useMemo<SectionItem[]>(
    () => sectionOrder.map(k => ({ sectionKey: k, items: sortSection(grouped[k]) })),
    [sectionOrder, grouped, sortSection],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Red Header */}
      <View style={styles.redHeader}>
        <Text style={styles.redHeaderTitle}>Explore</Text>
        <CloudlynkLogo size={28} />
      </View>

      {/* Filter chips */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={styles.filterChip}
              onPress={() => setActiveFilter(f.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, activeFilter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
              {activeFilter === f.key && <View style={styles.filterChipUnderline} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={Colors.brand} size="large" />
        </View>
      ) : sectionOrder.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No content available</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={sectionData}
          keyExtractor={s => s.sectionKey}
          showsVerticalScrollIndicator={false}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}
          renderItem={({ item: s }) => (
            <SectionBlock sectionKey={s.sectionKey} items={s.items} onSelect={handleSelect} />
          )}
          ListFooterComponent={<View style={{ height: 40 }} />}
        />
      )}

      <DetailModal selected={selected} onClose={() => setSelected(null)} userId={user?.id} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  redHeader: { backgroundColor: Colors.surface, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  redHeaderTitle: { color: '#ffffff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  crownBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#ffffff' },
  crownText: { fontSize: 18, color: Colors.brand, fontWeight: '900' },
  filterBar: { backgroundColor: Colors.bg, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  filterRow: { paddingHorizontal: 16, paddingVertical: 4, alignItems: 'center', gap: 4 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center' },
  filterChipText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: Colors.text, fontWeight: '800' },
  filterChipUnderline: { position: 'absolute', bottom: 0, left: 8, right: 8, height: 3, backgroundColor: Colors.text, borderRadius: 2 },
  grid: { padding: GAP },
  tile: { width: TILE, aspectRatio: 1, backgroundColor: Colors.card, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  tileTall: { aspectRatio: 9 / 16 },
  tileImg: { width: '100%', height: '100%' },
  tilePlaceholder: { backgroundColor: '#182437', alignItems: 'center', justifyContent: 'center' },
  tileScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' },
  playIcon: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  playIconText: { color: '#ffffff', fontSize: 10, marginLeft: 2, marginTop: -1 },
  tileTitleWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.45)' },
  tileTitle: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  sectionBlock: { marginBottom: 8 },
  sectionRow: { paddingHorizontal: 12, gap: 10 },
  sectionCard: { width: 140, marginRight: 0 },
  sectionCardImg: { width: 140, height: 80, borderRadius: 6, backgroundColor: '#182437' },
  sectionCardTitle: { fontSize: 12, color: '#FFFFFF', marginTop: 4, fontWeight: '600' },
  shortsSection: { paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#22304A', marginBottom: 8 },
  shortsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 8 },
  shortsTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  shortsBadge: { backgroundColor: '#A7F3D0', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  shortsBadgeText: { fontSize: 10, fontWeight: '800', color: '#0B1220' },
  shortsRow: { paddingHorizontal: 12, gap: 10 },
  shortCard: { width: 110, borderRadius: 8, overflow: 'hidden' },
  shortImg: { width: 110, height: 160, borderRadius: 8 },
  shortPlaceholder: { backgroundColor: '#182437', alignItems: 'center', justifyContent: 'center' },
  shortTitle: { fontSize: 11, fontWeight: '600', color: '#FFFFFF', marginTop: 4 },
  shortsEmpty: { paddingHorizontal: 12, paddingVertical: 20, alignItems: 'center' },
  shortsEmptyText: { fontSize: 13, color: '#6B7C97', fontWeight: '500' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyIcon: { width: 120, height: 120, borderRadius: 28, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: Colors.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  emptyIconText: { fontSize: 56 },
  emptyIconUpload: { position: 'absolute', bottom: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  emptyIconUploadText: { fontSize: 22, fontWeight: '900', color: Colors.brand },
  emptyText: { fontSize: 16, color: Colors.text, fontWeight: '600' },
  detailModal: { flex: 1, backgroundColor: Colors.bg },
  detailHero: { height: H * 0.4, position: 'relative', backgroundColor: Colors.brand },
  detailHeroImg: { width: '100%', height: '100%' },
  detailHeroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  detailClose: { position: 'absolute', right: 16, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  detailCloseTxt: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  detailBody: { flex: 1, padding: 20 },
  detailBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  detailBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.brandLight, borderWidth: 0.5, borderColor: Colors.brand },
  detailBadgeTxt: { fontSize: 11, color: Colors.brand, fontWeight: '800', letterSpacing: 0.5 },
  detailTitle: { fontSize: 24, fontWeight: '900', color: Colors.text, marginBottom: 8, letterSpacing: -0.5, lineHeight: 30 },
  detailDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, fontWeight: '500', marginBottom: 20 },
  playBtn: { backgroundColor: Colors.brand, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  playBtnTxt: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  shareBtn: { backgroundColor: Colors.bg, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  shareBtnTxt: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  fullscreenVideo: { width: '100%', height: '100%' },
  videoCloseBtn: { position: 'absolute', left: 16, zIndex: 20, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)' },
  videoCloseBtnTxt: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});
