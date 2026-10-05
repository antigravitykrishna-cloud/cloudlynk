import { memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { publicMedia } from '@/lib/publicMedia';
import { Colors, FontSize, FontWeight, Radius, withAlpha } from '@/theme';
import { formatMinutes } from '@/utils/format';
import {
  CONTENT_TYPE_LABELS,
  contentTypeColor,
  contentTypeIcon,
} from '@/features/content/contentTypes';
import type { ChannelPost } from '@/features/content/model';

const WIDTH = 120;
const POSTER_HEIGHT = 170;

/** A poster on a channel page: artwork, type badge, review status, running time and title. */
export const PostCard = memo(function PostCard({
  post,
  onPress,
}: {
  post: ChannelPost;
  onPress: () => void;
}) {
  const artwork = post.thumbnail_url ? publicMedia.url(post.thumbnail_url) : null;
  const reviewLabel =
    post.status === 'pending' ? '⏳ Review' : post.status === 'rejected' ? '✕ Rejected' : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.poster}>
        {artwork ? (
          <Image source={{ uri: artwork }} style={styles.artwork} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Icon name={contentTypeIcon(post.content_type)} size={26} color={Colors.textMuted} />
          </View>
        )}

        <View style={[styles.typeBadge, { backgroundColor: contentTypeColor(post.content_type) }]}>
          <Text style={styles.typeText}>{CONTENT_TYPE_LABELS[post.content_type]}</Text>
        </View>

        {reviewLabel ? (
          <View
            style={[
              styles.review,
              {
                backgroundColor: withAlpha(
                  post.status === 'pending' ? Colors.warning : Colors.danger,
                  0.85,
                ),
              },
            ]}
          >
            <Text style={styles.reviewText}>{reviewLabel}</Text>
          </View>
        ) : null}

        {post.duration_min ? (
          <View style={styles.duration}>
            <Text style={styles.durationText}>{formatMinutes(post.duration_min)}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {post.title ?? 'Untitled'}
      </Text>
      {post.content_type === 'series' && post.season_number && post.episode_number ? (
        <Text style={styles.episode}>
          S{post.season_number} E{post.episode_number}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: { width: WIDTH },
  poster: {
    width: WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  artwork: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceHover,
  },
  typeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  typeText: {
    fontSize: 8,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    letterSpacing: 0.8,
  },
  review: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 4, alignItems: 'center' },
  reviewText: { fontSize: FontSize.xs, fontWeight: FontWeight.extrabold, color: Colors.text },
  duration: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: withAlpha(Colors.black, 0.75),
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  durationText: { fontSize: FontSize.xs, color: Colors.text, fontWeight: FontWeight.bold },
  title: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.bold, lineHeight: 16 },
  episode: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
});
