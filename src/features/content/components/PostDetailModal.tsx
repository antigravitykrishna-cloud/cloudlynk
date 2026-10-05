import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { publicMedia } from '@/lib/publicMedia';
import { Colors, FontSize, FontWeight, Radius, Spacing, withAlpha } from '@/theme';
import { formatMinutes, formatTimeAgo } from '@/utils/format';
import { contentTypeColor } from '@/features/content/contentTypes';
import type { ChannelPost } from '@/features/content/model';
import { VideoPlayerOverlay } from '@/features/player/components/VideoPlayerOverlay';
import { usePostPlayback } from '@/features/player/hooks/usePostPlayback';

type Props = {
  post: ChannelPost | null;
  onClose: () => void;
  userId: string | undefined;
  /** Shows who uploaded it, as on a channel page. */
  showAuthor?: boolean;
  /** Adds a "⋯" button, e.g. the report / block menu on a channel page. */
  onMore?: () => void;
  /** Adds a Share button, as on Explore. */
  canShare?: boolean;
};

/** A post's detail sheet: artwork, details, and a Play button that opens the full-screen player. */
export function PostDetailModal({ post, onClose, userId, showAuthor, onMore, canShare }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const playback = usePostPlayback(post, userId);

  if (!post) return null;
  const thumbnail = post.thumbnail_url ? publicMedia.url(post.thumbnail_url) : null;
  const typeColor = contentTypeColor(post.content_type);

  const share = () => {
    Share.share({ message: post.title ?? 'Check this out on Cloudlynk' }).catch(() => {});
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={[styles.hero, { height: height * 0.4 }]}>
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Icon name="film" size={56} color={Colors.textMuted} />
            </View>
          )}
          <LinearGradient
            colors={['transparent', withAlpha(Colors.black, 0.92)]}
            style={StyleSheet.absoluteFill}
          />
          {onMore ? (
            <RoundButton
              label="⋯"
              accessibilityLabel="More options"
              onPress={onMore}
              style={{ top: insets.top + Spacing.md, right: 62 }}
            />
          ) : null}
          <RoundButton
            label="✕"
            accessibilityLabel="Close"
            onPress={onClose}
            style={{ top: insets.top + Spacing.md, right: Spacing.lg }}
          />
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.badges}>
            <Badge
              label={post.content_type.toUpperCase()}
              color={typeColor}
              background={withAlpha(typeColor, 0.2)}
            />
            {post.genre ? <Badge label={post.genre} /> : null}
            {post.release_year ? <Badge label={String(post.release_year)} /> : null}
            {post.duration_min ? <Badge label={formatMinutes(post.duration_min)} /> : null}
          </View>

          <Text style={styles.title}>{post.title ?? 'Untitled'}</Text>
          {post.content_type === 'series' && post.season_number ? (
            <Text style={styles.episode}>
              Season {post.season_number} · Episode {post.episode_number}
              {post.episode_title ? ` — ${post.episode_title}` : ''}
            </Text>
          ) : null}
          {post.body ? <Text style={styles.description}>{post.body}</Text> : null}

          {showAuthor ? <AuthorRow post={post} /> : null}

          <PlayButton playback={playback} />
          {canShare ? <Button label="↗  Share" variant="secondary" onPress={share} /> : null}
        </ScrollView>

        {playback.isPlaying ? (
          <VideoPlayerOverlay
            player={playback.player}
            onClose={playback.stop}
            postId={post.id}
            postTitle={post.title ?? undefined}
          />
        ) : null}
      </View>
    </Modal>
  );
}

/** Play, or why it cannot play: still loading, refused by the server, or no video at all. */
function PlayButton({ playback }: { playback: ReturnType<typeof usePostPlayback> }) {
  if (!playback.hasVideo || playback.error) {
    return (
      <View style={[styles.play, styles.playUnavailable]}>
        <Text style={styles.playUnavailableText}>{playback.error ?? 'No Video Available'}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={[styles.play, playback.loading && styles.playLoading]}
      onPress={playback.play}
      disabled={playback.loading || !playback.ready}
      accessibilityRole="button"
      accessibilityLabel="Play video"
    >
      {playback.loading ? (
        <ActivityIndicator color={Colors.text} />
      ) : (
        <Text style={styles.playText}>▶ Play Video</Text>
      )}
    </TouchableOpacity>
  );
}

function AuthorRow({ post }: { post: ChannelPost }) {
  const name = post.author?.full_name ?? 'Unknown';
  return (
    <View style={styles.author}>
      <Avatar name={name} size={40} />
      <View>
        <Text style={styles.authorName}>{name}</Text>
        <Text style={styles.authorMeta}>Added {formatTimeAgo(post.created_at)}</Text>
      </View>
    </View>
  );
}

function Badge({
  label,
  color = Colors.brandBlue,
  background = Colors.brandBlueDim,
}: {
  label: string;
  color?: string;
  background?: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: background, borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function RoundButton({
  label,
  accessibilityLabel,
  onPress,
  style,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  style: object;
}) {
  return (
    <TouchableOpacity
      style={[styles.round, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={styles.roundText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.bg },
  hero: { position: 'relative', backgroundColor: Colors.surface },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandBlueDim,
  },
  round: {
    position: 'absolute',
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: withAlpha(Colors.black, 0.6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  body: { flex: 1 },
  bodyContent: { padding: Spacing.xl, paddingBottom: 40 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  title: {
    fontSize: 26,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginBottom: Spacing.sm,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  episode: {
    fontSize: FontSize.base,
    color: Colors.brandBlue,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.md,
  },
  description: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  authorName: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  authorMeta: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  play: {
    backgroundColor: Colors.brandBlue,
    borderRadius: Radius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  playLoading: { opacity: 0.6 },
  playText: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.5,
  },
  playUnavailable: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
  },
  playUnavailableText: { color: Colors.textSecondary, fontSize: FontSize.md, textAlign: 'center' },
});
