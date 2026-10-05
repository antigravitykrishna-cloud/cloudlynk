import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/Press';
import { publicMedia } from '@/lib/publicMedia';
import { Colors, FontSize, FontWeight, Radius, Spacing, withAlpha } from '@/theme';
import { formatTimeAgo } from '@/utils/format';
import type { ListedPost } from '@/features/content/model';

/** "Drama · movie · 120 min · 3h ago". */
function describe(post: ListedPost): string {
  return [
    post.genre,
    post.content_type !== 'post' ? post.content_type : null,
    post.duration_min ? `${post.duration_min} min` : null,
    formatTimeAgo(post.created_at),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** One post in the Feed: thumbnail (with a lock when it needs a plan), title and details. */
export function FeedRow({
  post,
  index,
  locked,
  onPress,
}: {
  post: ListedPost;
  /** Position in the list, for the staggered entrance. */
  index: number;
  locked: boolean;
  onPress: () => void;
}) {
  const thumbnail = post.thumbnail_url ? publicMedia.url(post.thumbnail_url) : null;

  return (
    // 45 ms apart, capped at 8: an uncapped stagger makes a long list look broken on scroll.
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(260)}>
      <PressScale style={styles.card} onPress={onPress}>
        <View style={styles.thumbnailFrame}>
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.thumbnail} resizeMode="cover" />
          ) : (
            <View style={[styles.thumbnail, styles.placeholder]}>
              <Icon name="film" size={22} color={Colors.textMuted} />
            </View>
          )}
          {locked ? (
            <View style={styles.lock}>
              <Icon name="lock" size={12} color={Colors.white} />
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {post.title?.trim() || 'Untitled'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {describe(post)}
          </Text>
        </View>

        <Icon name="chevron-right" size={16} color={Colors.textMuted} />
      </PressScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: 10,
    marginBottom: 10,
  },
  thumbnailFrame: { width: 96, height: 64, borderRadius: Radius.sm, overflow: 'hidden' },
  thumbnail: { width: '100%', height: '100%', borderRadius: Radius.sm },
  placeholder: { backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  lock: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: withAlpha(Colors.black, 0.72),
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  title: {
    color: Colors.text,
    fontSize: FontSize.subhead,
    fontWeight: FontWeight.bold,
    lineHeight: 20,
  },
  meta: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: Spacing.xs },
});
