import { CloudlynkLogo } from '@/components/ui/CloudlynkLogo';
import { guestTappedTitle } from '@/lib/auth/guest';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ExploreSkeleton } from '@/components/ui/Skeleton';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { PostService, ChannelPost } from '@/lib/data/posts';
import { Colors, Radius, FontWeight } from '@/constants/theme';
import { DetailModal } from '@/components/explore/DetailModal';
import { SectionBlock } from '@/components/explore/SectionBlock';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'popular', label: 'Popular' },
  { key: 'most_watched', label: 'Most watched' },
  { key: 'latest', label: 'Latest' },
  { key: 'most_searched', label: 'Most searched' },
];

type SectionItem = { sectionKey: string; items: ChannelPost[] };

export default function ExploreScreen() {
  const { user, isPaidUser, isAdmin, isGuest } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<ChannelPost[]>([]);
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
      setSelected(null);
      setLoading(true);
    }
    prevUserIdRef.current = user?.id;
  }, [user?.id]);

  // A guest can browse the catalogue but not open a post: the row they were
  // served has no video_url, so a detail view would be a dead player. Ask for
  // the account here instead, where the intent is obvious and the prompt can
  // say what it unlocks.
  const handleSelect = useCallback(
    async (item: ChannelPost) => {
      // A guest -- signed out, or a guest account -- sees
      // previews only. Nothing plays, free or premium; the plans are the next
      // step (and, signed out, the sign-in sheet after them).
      if (!user?.id || isGuest) {
        guestTappedTitle(router, !!user?.id && isPaidUser);
        return;
      }

      // Signed in but not entitled to this title (locked previews have no video URL): go straight
      // to the plans. Admins have access without a plan.
      if (item.access_level === 'premium' && !isPaidUser && !isAdmin) {
        router.push('/premium');
        return;
      }

      setSelected(item);
      PostService.recordView(item.id);
    },
    [user?.id, isGuest, isPaidUser, isAdmin, router],
  );

  const load = useCallback(async () => {
    try {
      // Signed-out visitors browse too. getGuestExplorePosts names its
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

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const grouped = useMemo(() => PostService.groupByGenre(posts), [posts]);

  const sectionOrder = useMemo(() => {
    const fixed = ['Featured', 'Movies', 'Shorts'];
    const seriesKeys = Object.keys(grouped).filter(
      k => k.startsWith('Series: ') || k === 'Web Series',
    );
    const dynamic = Object.keys(grouped).filter(k => !fixed.includes(k) && !seriesKeys.includes(k));
    // Order: Featured → Movies → named Series rows → Web Series → Shorts → genre/other
    return ['Featured', 'Movies', ...seriesKeys, 'Shorts', ...dynamic].filter(
      k => grouped[k] && grouped[k].length > 0,
    );
  }, [grouped]);

  const sortSection = useCallback(
    (items: ChannelPost[]): ChannelPost[] => {
      if (activeFilter === 'latest') {
        return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
      } else if (
        activeFilter === 'popular' ||
        activeFilter === 'most_watched' ||
        activeFilter === 'most_searched'
      ) {
        return [...items].sort(
          (a, b) => ((b as any).view_count ?? 0) - ((a as any).view_count ?? 0),
        );
      }
      return items;
    },
    [activeFilter],
  );

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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={styles.filterChip}
              onPress={() => setActiveFilter(f.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === f.key && styles.filterChipTextActive,
                ]}
              >
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
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.brand}
            />
          }
        >
          <View style={styles.emptyState}>
            <Icon name={loadFailed ? 'refresh' : 'compass'} size={44} color={Colors.textMuted} />
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.brand}
            />
          }
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
  redHeader: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  redHeaderTitle: { color: '#ffffff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  filterBar: {
    backgroundColor: Colors.bg,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  filterRow: { paddingHorizontal: 16, paddingVertical: 4, alignItems: 'center', gap: 4 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center' },
  filterChipText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: Colors.text, fontWeight: '800' },
  filterChipUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    right: 8,
    height: 3,
    backgroundColor: Colors.text,
    borderRadius: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
  },
  emptyText: { fontSize: 16, color: Colors.text, fontWeight: '600', marginTop: 14 },
  emptyHint: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
  },
  retryBtnText: { fontSize: 14, fontWeight: FontWeight.bold, color: Colors.textInverse },
});
