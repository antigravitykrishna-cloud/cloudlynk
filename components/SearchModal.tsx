import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity,
  ScrollView, Image,
} from 'react-native';
import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useRouter } from 'expo-router';
import { SearchService, SearchResults, SearchChannel } from '../lib/search';
import { ChannelPost, PostService } from '../lib/posts';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { Icon } from './Icon';

const CARD_W = 120;
const CARD_H = 170;

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

const PostCard = memo(({ item, onPress }: { item: ChannelPost; onPress: () => void }) => {
  const thumb = item.thumbnail_url ? PostService.getMediaPublicUrl(item.thumbnail_url) : null;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardThumb}>
        {thumb
          ? <Image source={{ uri: thumb }} style={styles.cardThumbImg} resizeMode="cover" />
          : <View style={styles.cardPlaceholder}><Text style={{ fontSize: 28 }}>{'🎬'}</Text></View>
        }
        {!!item.genre && (
          <View style={styles.genreBadge}>
            <Text style={styles.genreTxt}>{item.genre}</Text>
          </View>
        )}
        {!!item.duration_min && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationTxt}>{formatDuration(item.duration_min)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title ?? 'Untitled'}</Text>
    </TouchableOpacity>
  );
});
PostCard.displayName = 'PostCard';

const ChannelCard = memo(({ channel, onPress }: { channel: SearchChannel; onPress: () => void }) => (
  <TouchableOpacity style={styles.channelCard} onPress={onPress} activeOpacity={0.75}>
    <View style={styles.channelIcon}><Text style={{ fontSize: 22 }}>{'📡'}</Text></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
      {!!channel.description && <Text style={styles.channelDesc} numberOfLines={1}>{channel.description}</Text>}
    </View>
    <Text style={styles.channelMembers}>{channel.member_count} members</Text>
  </TouchableOpacity>
));
ChannelCard.displayName = 'ChannelCard';

const SkeletonCards = () => (
  <View style={styles.skeletonRow}>
    {[1, 2, 3].map(i => (
      <View key={i} style={styles.skeletonCard} />
    ))}
  </View>
);

export function SearchModal({ visible, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults(null);
    }
  }, [visible]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    try {
      const r = await SearchService.searchAll(q);
      setResults(r);
    } catch (err) {
      if (__DEV__) console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const onChangeText = useCallback((text: string) => {
    setQuery(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (text.trim().length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(() => doSearch(text), 300);
  }, [doSearch]);

  const openPost = useCallback((post: ChannelPost) => {
    onClose();
    router.push({ pathname: '/(tabs)/channels/[id]', params: { id: post.channel_id, resumePostId: post.id } });
  }, [onClose, router]);

  const openChannel = useCallback((channel: SearchChannel) => {
    onClose();
    router.push({ pathname: '/(tabs)/channels/[id]', params: { id: channel.id } });
  }, [onClose, router]);

  const hasResults = results && (
    results.channels.length > 0 ||
    results.movies.length > 0 ||
    results.series.length > 0 ||
    results.shorts.length > 0
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.inputWrap}>
            <Icon name="search" size={16} color={Colors.textMuted} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={query}
              onChangeText={onChangeText}
              placeholder="Search movies, series, channels..."
              placeholderTextColor={Colors.textMuted}
              returnKeyType="search"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); setResults(null); }}>
                <Text style={styles.clearBtn}>{'✕'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!query.trim() && !loading && (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48, marginBottom: Spacing.md }}>{'🔍'}</Text>
              <Text style={styles.emptyTitle}>Search across all of Cloudlynk</Text>
              <Text style={styles.emptyDesc}>Find movies, series, shorts, and channels</Text>
            </View>
          )}

          {loading && <SkeletonCards />}

          {!loading && results && !hasResults && (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48, marginBottom: Spacing.md }}>{'🔎'}</Text>
              <Text style={styles.emptyTitle}>{`No results for '${query}'`}</Text>
              <Text style={styles.emptyDesc}>Try a different search term</Text>
            </View>
          )}

          {!loading && results && hasResults && (
            <>
              {results.channels.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Channels</Text>
                  {results.channels.map(ch => (
                    <ChannelCard key={ch.id} channel={ch} onPress={() => openChannel(ch)} />
                  ))}
                </View>
              )}

              {results.movies.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Movies</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                    {results.movies.map(p => (
                      <PostCard key={p.id} item={p} onPress={() => openPost(p)} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {results.series.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Series</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                    {results.series.map(p => (
                      <PostCard key={p.id} item={p} onPress={() => openPost(p)} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {results.shorts.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Shorts</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                    {results.shorts.map(p => (
                      <PostCard key={p.id} item={p} onPress={() => openPost(p)} />
                    ))}
                  </ScrollView>
                </View>
              )}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: 56, paddingBottom: Spacing.md, gap: Spacing.sm },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.md, paddingHorizontal: Spacing.md, height: 44, borderWidth: 0.5, borderColor: Colors.border },
  searchIcon: { fontSize: 16, marginRight: Spacing.sm },
  input: { flex: 1, fontSize: FontSize.base, color: Colors.text, fontWeight: FontWeight.semibold },
  clearBtn: { color: Colors.textMuted, fontSize: 16, paddingLeft: Spacing.sm },
  cancelBtn: { paddingVertical: Spacing.sm },
  cancelTxt: { fontSize: FontSize.base, color: Colors.accent, fontWeight: FontWeight.bold },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: Spacing.xxxl },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.sm, textAlign: 'center' },
  emptyDesc: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center' },
  section: { marginTop: Spacing.xl },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.extrabold, color: Colors.text, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  row: { paddingHorizontal: Spacing.lg, gap: 12 },
  card: { width: CARD_W },
  cardThumb: { width: CARD_W, height: CARD_H, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Colors.card, marginBottom: 8, position: 'relative', borderWidth: 0.5, borderColor: Colors.border },
  cardThumbImg: { width: '100%', height: '100%' },
  cardPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  genreBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  genreTxt: { fontSize: 8, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  durationBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  durationTxt: { fontSize: 10, color: '#fff', fontWeight: '700' },
  cardTitle: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.bold, lineHeight: 16 },
  channelCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  channelIcon: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: Colors.border },
  channelName: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  channelDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  channelMembers: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold },
  skeletonRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: 12, marginTop: Spacing.xl },
  skeletonCard: { width: CARD_W, height: CARD_H, borderRadius: Radius.sm, backgroundColor: Colors.card },
});
