import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { memo } from 'react';
import { WatchHistoryEntry } from '../hooks/useWatchHistory';
import { PostService } from '../lib/posts';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

const CARD_W = 160;
const CARD_H = 90;

function formatRemaining(positionSec: number, durationSec: number): string {
  const remaining = Math.max(0, durationSec - positionSec);
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m left`;
  }
  return min > 0 ? `${min}:${sec.toString().padStart(2, '0')} left` : `${sec}s left`;
}

type Props = {
  items: WatchHistoryEntry[];
  onResume: (entry: WatchHistoryEntry) => void;
};

const ContinueWatchingCard = memo(({ entry, onPress }: { entry: WatchHistoryEntry; onPress: () => void }) => {
  const thumb = entry.post.thumbnail_url ? PostService.getMediaPublicUrl(entry.post.thumbnail_url) : null;
  const percent = entry.duration_seconds > 0
    ? Math.min((entry.position_seconds / entry.duration_seconds) * 100, 100)
    : 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.thumbWrap}>
        {thumb
          ? <Image source={{ uri: thumb }} style={styles.thumbImg} resizeMode="cover" />
          : <View style={styles.thumbPlaceholder}><Text style={{ fontSize: 24 }}>{'🎬'}</Text></View>
        }
        <View style={styles.resumeBadge}>
          <Text style={styles.resumeTxt}>{'▶'}</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.title} numberOfLines={1}>{entry.post.title ?? 'Untitled'}</Text>
      <Text style={styles.remaining}>
        {formatRemaining(entry.position_seconds, entry.duration_seconds)}
      </Text>
    </TouchableOpacity>
  );
});
ContinueWatchingCard.displayName = 'ContinueWatchingCard';

export const ContinueWatchingRow = memo(({ items, onResume }: Props) => {
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Continue Watching</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map(entry => (
          <ContinueWatchingCard
            key={entry.id}
            entry={entry}
            onPress={() => onResume(entry)}
          />
        ))}
      </ScrollView>
    </View>
  );
});
ContinueWatchingRow.displayName = 'ContinueWatchingRow';

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.lg },
  header: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  headerTitle: { fontSize: FontSize.base, fontWeight: FontWeight.extrabold, color: Colors.text },
  row: { paddingHorizontal: Spacing.lg, gap: 12 },
  card: { width: CARD_W },
  thumbWrap: { width: CARD_W, height: CARD_H, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Colors.card, position: 'relative', borderWidth: 0.5, borderColor: Colors.border },
  thumbImg: { width: '100%', height: '100%' },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card },
  resumeBadge: { position: 'absolute', top: '50%', left: '50%', marginTop: -16, marginLeft: -16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  resumeTxt: { color: '#fff', fontSize: 14 },
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: Radius.sm, borderBottomRightRadius: Radius.sm, overflow: 'hidden', marginTop: -3 },
  progressFill: { height: '100%', backgroundColor: Colors.accent },
  title: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.bold, marginTop: 6, lineHeight: 16 },
  remaining: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, marginTop: 2 },
});
