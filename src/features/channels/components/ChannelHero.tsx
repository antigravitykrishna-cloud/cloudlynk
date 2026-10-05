import { Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { publicMedia } from '@/lib/publicMedia';
import { Colors, FontSize, FontWeight, Radius, Spacing, withAlpha } from '@/theme';
import { formatMinutes } from '@/utils/format';
import type { Channel } from '@/features/channels/api/channelsApi';
import type { ChannelPost } from '@/features/content/model';

/**
 * The top of a channel page: the featured title's artwork with Play / More Info, or the channel's
 * own name and description when it has nothing featured yet, plus Join or "Subscribed".
 */
export function ChannelHero({
  channel,
  featured,
  isMember,
  joining,
  onBack,
  onJoin,
  onOpen,
}: {
  channel: Channel | null;
  featured: ChannelPost | null;
  isMember: boolean;
  joining: boolean;
  onBack: () => void;
  onJoin: () => void;
  onOpen: (post: ChannelPost) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const artwork = featured?.thumbnail_url ? publicMedia.url(featured.thumbnail_url) : null;

  const details = featured
    ? [
        featured.genre,
        featured.release_year,
        featured.duration_min ? formatMinutes(featured.duration_min) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <View style={[styles.hero, { height: height * 0.52 }]}>
      {artwork ? (
        <Image source={{ uri: artwork }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]} />
      )}
      <LinearGradient
        colors={[withAlpha(Colors.black, 0.15), withAlpha(Colors.black, 0.5), Colors.black]}
        style={StyleSheet.absoluteFill}
      />

      <TouchableOpacity
        style={[styles.back, { top: insets.top + Spacing.sm }]}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={styles.backText}>‹</Text>
      </TouchableOpacity>

      <View style={styles.bottom}>
        <Text style={styles.channelName}>{channel?.name ?? ''}</Text>
        {featured ? (
          <>
            <Text style={styles.title}>{featured.title}</Text>
            {featured.genre ? <Text style={styles.details}>{details}</Text> : null}
            <View style={styles.actions}>
              <Button
                label="▶  Play"
                variant="inverse"
                onPress={() => onOpen(featured)}
                style={styles.action}
              />
              <Button
                label="ⓘ  More Info"
                variant="overlay"
                onPress={() => onOpen(featured)}
                style={styles.action}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>{channel?.name}</Text>
            {channel?.description && channel.description !== channel.name ? (
              <Text style={styles.details}>{channel.description}</Text>
            ) : null}
          </>
        )}

        {isMember ? (
          <Text style={styles.subscribed}>✓ Subscribed</Text>
        ) : channel?.status === 'active' ? (
          <Button label="+ Join Channel" onPress={onJoin} busy={joining} style={styles.join} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', position: 'relative', backgroundColor: Colors.surface },
  placeholder: { backgroundColor: Colors.brandBlueDim },
  back: {
    position: 'absolute',
    left: Spacing.lg,
    zIndex: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(Colors.black, 0.5),
    borderRadius: 22,
  },
  backText: { fontSize: 26, color: Colors.text, fontWeight: FontWeight.bold },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  channelName: {
    fontSize: FontSize.sm,
    color: Colors.brandBlue,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 1.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginBottom: 6,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  details: {
    fontSize: FontSize.md,
    color: withAlpha(Colors.white, 0.7),
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.lg,
  },
  actions: { flexDirection: 'row', gap: 10, marginBottom: Spacing.md },
  action: { flex: 1, borderRadius: Radius.sm },
  join: { marginTop: Spacing.xs, borderRadius: Radius.sm },
  subscribed: {
    fontSize: FontSize.md,
    color: withAlpha(Colors.white, 0.6),
    fontWeight: FontWeight.bold,
    marginTop: Spacing.xs,
  },
});
