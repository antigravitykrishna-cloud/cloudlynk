import { CloudlynkLogo } from '../../components/CloudlynkLogo';
import { VideoPlayerOverlay } from '../../components/VideoPlayerOverlay';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Modal, ActivityIndicator, RefreshControl, Dimensions, Share } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '../../components/Icon';
import { PressScale } from '../../components/Press';
import { ExploreSkeleton } from '../../components/Skeleton';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useRecordProgress, getSavedPosition } from '../../hooks/useWatchHistory';
import { PostService, ChannelPost } from '../../lib/posts';
import { StreamService } from '../../lib/stream';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { Colors, Radius, FontWeight } from '../../constants/theme';

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
    <PressScale style={[styles.tile, isTall && styles.tileTall]} onPress={onPress} scaleTo={0.95}>
      {thumb
        ? <Image source={{ uri: thumb }} style={styles.tileImg} resizeMode="cover" />
        : <View style={[styles.tileImg, styles.tilePlaceholder]}>
            <Icon name={contentIcon(item.content_type)} size={30} color={Colors.textMuted} />
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
    </PressScale>
  );
});
VideoTile.displayName = 'VideoTile';


/** Placeholder glyph when a post has no thumbnail. */
function contentIcon(t?: string | null): IconName {
  return t === 'movie' ? 'film' : t === 'series' ? 'tv' : t === 'short' ? 'video' : 'document';
}

type SectionItem = { sectionKey: string; items: ChannelPost[] };

const SectionCard = memo(({ item, isShorts, onPress }: {
  item: ChannelPost; isShorts: boolean; onPress: () => void;
}) => {
  const thumb = item.thumbnail_url ? PostService.getMediaPublicUrl(item.thumbnail_url) : null;
  return (
    <PressScale
      style={isShorts ? styles.shortCard : styles.sectionCard}
      onPress={onPress}
      scaleTo={0.95}
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
          <Icon name={contentIcon(item.content_type)} size={isShorts ? 24 : 28} color={Colors.textMuted} />
        </View>
      )}
      {/* Premium marker. Without it the only way to discover a title is
          premium is to tap it and be refused, which reads as the app being
          broken rather than as an upsell. Shown to everyone, signed in or
          not: for a subscriber it is a badge, for a guest it is the reason
          to subscribe. */}
      {item.access_level === 'premium' && (
        <View style={styles.premiumBadge} pointerEvents="none">
          <Text style={styles.premiumBadgeText}>PREMIUM</Text>
        </View>
      )}
      <Text style={isShorts ? styles.shortTitle : styles.sectionCardTitle} numberOfLines={2}>
        {item.title ?? 'Untitled'}
      </Text>
    </PressScale>
  );
});
SectionCard.displayName = 'SectionCard';


/**
 * Full-bleed hero for the first Featured title.
 *
 * A streaming home screen opens with one large piece of art, not a grid — it
 * is what tells you in half a second that this is a place to watch something.
 * Before this, "Featured" was a 140x80 thumbnail in a row, which read as a
 * list item, and with one entry it left two thirds of the row empty.
 *
 * The gradient is a scrim, not decoration: poster art is arbitrary, so white
 * title text needs a guaranteed dark floor underneath it or it becomes
 * unreadable over a bright frame.
 */
const HeroCard = memo(({ item, onPress }: { item: ChannelPost; onPress: () => void }) => {
  const thumb = item.thumbnail_url ? PostService.getMediaPublicUrl(item.thumbnail_url) : null;
  return (
    <PressScale style={styles.hero} onPress={onPress} scaleTo={0.985}>
      {thumb ? (
        <Image source={thumb} style={styles.heroImg} contentFit="cover" transition={220} />
      ) : (
        // A thumbnail-less hero is 460px tall, so an empty placeholder reads
        // as a rendering failure rather than as missing artwork — the app
        // opens on a wall of flat colour with a title floating at the bottom.
        // The detail screen already draws an icon in the same situation
        // (detailHeroPlaceholder); this just brings the hero into line.
        <View style={[styles.heroImg, styles.heroPlaceholder]}>
          <Icon name={item.content_type === 'series' ? 'tv' : 'film'} size={56} color={Colors.textMuted} />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(11,18,32,0.55)', 'rgba(11,18,32,0.97)']}
        locations={[0, 0.45, 1]}
        style={styles.heroScrim}
      />
      <View style={styles.heroBody}>
        {item.access_level === 'premium' ? (
          <View style={styles.heroTag}><Text style={styles.heroTagText}>PREMIUM</Text></View>
        ) : (
          <View style={[styles.heroTag, styles.heroTagFree]}><Text style={styles.heroTagText}>FREE</Text></View>
        )}
        <Text style={styles.heroTitle} numberOfLines={2}>{item.title ?? 'Untitled'}</Text>
        {item.genre ? <Text style={styles.heroMeta} numberOfLines={1}>{item.genre}</Text> : null}
        <View style={styles.heroPlay}>
          <Icon name="play" size={16} color={Colors.textInverse} filled />
          <Text style={styles.heroPlayText}>Play</Text>
        </View>
      </View>
    </PressScale>
  );
});
HeroCard.displayName = 'HeroCard';

const SectionBlock = memo(({ sectionKey, items, onSelect }: {
  sectionKey: string; items: ChannelPost[]; onSelect: (item: ChannelPost) => void;
}) => {
  const isShorts = sectionKey === 'Shorts';

  // Featured is the hero, not a row. Its first item gets the full-width
  // treatment; anything after it falls through to the normal carousel so a
  // second featured title is not silently dropped.
  if (sectionKey === 'Featured' && items.length > 0) {
    const [lead, ...rest] = items;
    return (
      <View style={styles.sectionBlock}>
        <HeroCard item={lead} onPress={() => onSelect(lead)} />
        {rest.length > 0 && (
          <FlatList
            data={rest}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={i => i.id}
            contentContainerStyle={styles.sectionRow}
            renderItem={({ item }) => (
              <SectionCard item={item} isShorts={false} onPress={() => onSelect(item)} />
            )}
          />
        )}
      </View>
    );
  }

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
            : <View style={[styles.detailHeroImg, styles.detailHeroPlaceholder]}><Icon name="film" size={56} color={Colors.textMuted} /></View>
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
  // Distinguishes "the catalogue is empty" from "the request failed". Without
  // it a dropped connection renders as "No content available", which is a
  // lie: it tells the user there is nothing to watch when the truth is that
  // we could not find out.
  const [loadFailed, setLoadFailed] = useState(false);

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
  const handleSelect = useCallback(async (item: ChannelPost) => {
    // v63: a guest watches FREE content without an account. Only Premium asks
    // for one, and it asks for a subscription in the same breath — being told
    // to sign in, and only then that you also have to pay, is the worse of the
    // two orderings.
    if (!user?.id) {
      if (item.access_level === 'premium') {
        showAlert(
          'Premium title',
          'This one is part of Cloudlynk Premium. Create an account and subscribe to watch it — everything marked Free plays without an account.',
          [
            { text: 'Continue as guest', style: 'cancel' },
            // Someone who just tapped a locked title is the most curious
            // they will ever be about the price. Sending them to the plans
            // costs one tap; making them sign up first to find out costs
            // most of them.
            { text: 'See Premium plans', onPress: () => router.push('/premium') },
            // /(auth)/login, not /(auth)/signup: login is now the one-tap
            // chooser (guest / Google / emailed code) and creates the account
            // as a side effect of signing in. signup.tsx is the old
            // email+password form, kept only for accounts that already have a
            // password — sending a new user there is three extra fields for
            // no reason.
            { text: 'Sign up free', onPress: () => router.push('/(auth)/login') },
          ],
        );
        return;
      }

      // Free. The guest's own row has no video_url — anon is not granted that
      // column, because a grant cannot be limited to free rows and would leak
      // every premium UID too. free_post_media (v63) is the row-filtered way
      // in, and it can only ever return free posts.
      try {
        const media = await PostService.getFreeMedia(item.id);
        if (!media?.video_url && !media?.media_url) {
          showAlert('Not available', "This one can't be played right now.");
          return;
        }
        setSelected({ ...item, ...media } as ChannelPost);
      } catch (err: any) {
        // Distinguish "the view isn't deployed" from "the network is down".
        // PostgREST answers 404/PGRST205 for an unknown relation, and telling
        // someone to check their connection when the server is answering fine
        // sends them to reboot their router instead of to the real cause.
        const code = err?.code ?? '';
        const missingView =
          code === 'PGRST205' || code === '42P01' ||
          /free_post_media|does not exist|not find the table/i.test(err?.message ?? '');
        showAlert(
          'Not available',
          missingView
            ? 'Free playback is not switched on for this app yet. Ask the Cloudlynk team to finish setup — nothing is wrong with your device.'
            : 'Could not load this video. Check your connection and try again.',
        );
      }
      return;
    }

    // Signed in, but not entitled to THIS title.
    //
    // Before v79 this branch could not be reached with a premium item:
    // channel_posts_select_v57 filtered those rows out, so a signed-in free
    // user never had one to tap. v79 deliberately shows them the locked
    // catalogue through premium_preview -- and those rows carry no video_url
    // by construction, because the view has no such column.
    //
    // So without this check, tapping a locked title opens the detail view on
    // a post that can never play: a dead player and no explanation. That is
    // the exact failure v56 called out -- "they would see the post in the
    // feed and then get a 403 the moment they pressed play, visibly broken"
    // -- reintroduced through the front door by making previews visible.
    //
    // Admins are exempt: they hold access without a plan, and the row they
    // received came from channel_posts with a real video_url.
    if (item.access_level === 'premium' && !isPaidUser && !isAdmin) {
      showAlert(
        'Premium title',
        'Subscribe to watch this in full. One subscription unlocks every premium title while it is active.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'See Premium plans', onPress: () => router.push('/premium') },
        ],
      );
      return;
    }

    setSelected(item);
    PostService.recordView(item.id);
  }, [user?.id, isPaidUser, isAdmin, router]);

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
      setLoadFailed(false);
    } catch (err) {
      if (__DEV__) console.error(err);
      // Deliberately does NOT clear `posts`. If a refresh fails, keeping what
      // is already on screen is better than blanking a working catalogue —
      // the banner says the refresh failed, and the stale list still plays.
      setLoadFailed(true);
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
        <ExploreSkeleton />
      ) : sectionOrder.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}>
          <View style={styles.emptyState}>
            <Icon
              name={loadFailed ? 'refresh' : 'compass'}
              size={44}
              color={Colors.textMuted}
            />
            <Text style={styles.emptyText}>
              {loadFailed ? "Couldn't load content" : 'No content available'}
            </Text>
            <Text style={styles.emptyHint}>
              {loadFailed
                ? 'Check your connection and try again.'
                : 'New titles appear here as soon as they are approved.'}
            </Text>
            {loadFailed && (
              <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} activeOpacity={0.85}>
                <Text style={styles.retryBtnText}>Try again</Text>
              </TouchableOpacity>
            )}
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
  sectionBlock: { marginBottom: 22 },
  hero: {
    height: 460,
    marginBottom: 20,
    backgroundColor: Colors.surface,
    position: 'relative',
  },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroBody: { position: 'absolute', left: 20, right: 20, bottom: 22 },
  heroTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,212,255,0.16)',
    borderWidth: 1, borderColor: Colors.brandCyan,
    borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 3,
    marginBottom: 10,
  },
  heroTagFree: {
    backgroundColor: 'rgba(46,212,122,0.16)',
    borderColor: Colors.success,
  },
  heroTagText: {
    color: '#FFFFFF', fontSize: 10,
    fontWeight: FontWeight.extrabold, letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#FFFFFF', fontSize: 30, fontWeight: '800',
    letterSpacing: -0.6, lineHeight: 35,
  },
  heroMeta: { color: Colors.textSecondary, fontSize: 14, marginTop: 6 },
  heroPlay: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.full,
    paddingHorizontal: 22, paddingVertical: 11,
    marginTop: 16,
  },
  heroPlayText: { color: Colors.textInverse, fontSize: 15, fontWeight: FontWeight.bold },

  premiumBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: 'rgba(11,18,32,0.82)',
    borderWidth: 1, borderColor: Colors.brandCyan,
    borderRadius: Radius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  premiumBadgeText: {
    color: Colors.brandCyan, fontSize: 9,
    fontWeight: FontWeight.extrabold, letterSpacing: 0.6,
  },
  sectionRow: { paddingHorizontal: 16, gap: 12 },
  sectionCard: { width: 132, marginRight: 0 },
  sectionCardImg: { width: 132, height: 198, borderRadius: 8, backgroundColor: '#182437' },
  sectionCardTitle: { fontSize: 13, color: '#FFFFFF', marginTop: 6, fontWeight: '600', lineHeight: 17 },
  shortsSection: { paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#22304A', marginBottom: 8 },
  shortsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 8 },
  shortsTitle: { fontSize: 19, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  shortsBadge: { backgroundColor: 'rgba(46,212,122,0.16)', borderWidth: 1, borderColor: Colors.success, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  shortsBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.8 },
  shortsRow: { paddingHorizontal: 12, gap: 10 },
  shortCard: { width: 120, borderRadius: 8, overflow: 'hidden' },
  shortImg: { width: 120, height: 205, borderRadius: 8 },
  shortPlaceholder: { backgroundColor: '#182437', alignItems: 'center', justifyContent: 'center' },
  heroPlaceholder: { backgroundColor: '#182437', alignItems: 'center', justifyContent: 'center' },
  shortTitle: { fontSize: 11, fontWeight: '600', color: '#FFFFFF', marginTop: 4 },
  shortsEmpty: { paddingHorizontal: 12, paddingVertical: 20, alignItems: 'center' },
  shortsEmptyText: { fontSize: 13, color: '#6B7C97', fontWeight: '500' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyIcon: { width: 120, height: 120, borderRadius: 28, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: Colors.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  emptyIconText: { fontSize: 56 },
  emptyIconUpload: { position: 'absolute', bottom: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  emptyIconUploadText: { fontSize: 22, fontWeight: '900', color: Colors.brand },
  emptyText: { fontSize: 16, color: Colors.text, fontWeight: '600', marginTop: 14 },
  emptyHint: { fontSize: 14, color: Colors.textSecondary, marginTop: 6, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  retryBtn: { marginTop: 18, paddingHorizontal: 24, paddingVertical: 11, borderRadius: Radius.md, backgroundColor: Colors.accent },
  retryBtnText: { fontSize: 14, fontWeight: FontWeight.bold, color: Colors.textInverse },
  detailModal: { flex: 1, backgroundColor: Colors.bg },
  detailHero: { height: H * 0.4, position: 'relative', backgroundColor: Colors.brand },
  detailHeroImg: { width: '100%', height: '100%' },
  detailHeroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  detailClose: { position: 'absolute', right: 16, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
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
