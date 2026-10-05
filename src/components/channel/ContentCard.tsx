import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { memo } from 'react';
import { PostService, ChannelPost } from '@/lib/data/posts';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { formatDuration, getTypeColor } from '@/components/channel/shared';

const CARD_W = 120;

const CARD_H = 170;

export const ContentCard = memo(({ item, onPress }: { item: ChannelPost; onPress: () => void }) => {
  const thumb = item.thumbnail_url ? PostService.getMediaPublicUrl(item.thumbnail_url) : null;
  const isPending = item.status === 'pending';
  const isRejected = item.status === 'rejected';
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardThumb}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.cardThumbImg} resizeMode="cover" />
        ) : (
          <View style={styles.cardThumbPlaceholder}>
            <Icon
              name={
                item.content_type === 'movie'
                  ? 'film'
                  : item.content_type === 'series'
                    ? 'tv'
                    : item.content_type === 'short'
                      ? 'video'
                      : 'document'
              }
              size={26}
              color={Colors.textMuted}
            />
          </View>
        )}
        <View style={[styles.cardTypeBadge, { backgroundColor: getTypeColor(item.content_type) }]}>
          <Text style={styles.cardTypeTxt}>
            {item.content_type === 'movie'
              ? 'MOVIE'
              : item.content_type === 'series'
                ? 'SERIES'
                : item.content_type === 'short'
                  ? 'SHORT'
                  : 'POST'}
          </Text>
        </View>
        {(isPending || isRejected) && (
          <View
            style={[
              styles.statusOverlay,
              { backgroundColor: isPending ? 'rgba(227,179,65,0.85)' : 'rgba(248,81,73,0.85)' },
            ]}
          >
            <Text style={styles.statusOverlayTxt}>{isPending ? '⏳ Review' : '✕ Rejected'}</Text>
          </View>
        )}
        {!!item.duration_min && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationTxt}>{formatDuration(item.duration_min)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title ?? 'Untitled'}
      </Text>
      {item.content_type === 'series' && item.season_number && item.episode_number && (
        <Text style={styles.cardEpTxt}>
          S{item.season_number} E{item.episode_number}
        </Text>
      )}
    </TouchableOpacity>
  );
});
ContentCard.displayName = 'ContentCard';

const styles = StyleSheet.create({
  card: { width: CARD_W },
  cardThumb: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    marginBottom: 6,
    position: 'relative',
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  cardThumbImg: { width: '100%', height: '100%' },
  cardThumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceHover,
  },
  cardTypeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardTypeTxt: { fontSize: 8, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
  statusOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 4,
    alignItems: 'center',
  },
  statusOverlayTxt: { fontSize: 11, fontWeight: '800', color: '#fff' },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationTxt: { fontSize: 11, color: '#fff', fontWeight: '700' },
  cardTitle: { fontSize: 12, color: Colors.text, fontWeight: '700', lineHeight: 16 },
  cardEpTxt: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
});
