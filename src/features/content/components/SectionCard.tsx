import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/Press';
import { PostService, ChannelPost } from '@/features/content/api/postsApi';
import { Colors, FontWeight, Radius, withAlpha } from '@/theme';
import { contentIcon } from '@/features/content/components/contentIcon';

export const SectionCard = memo(
  ({ item, isShorts, onPress }: { item: ChannelPost; isShorts: boolean; onPress: () => void }) => {
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
          <View
            style={[isShorts ? styles.shortImg : styles.sectionCardImg, styles.shortPlaceholder]}
          >
            <Icon
              name={contentIcon(item.content_type)}
              size={isShorts ? 24 : 28}
              color={Colors.textMuted}
            />
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
  },
);
SectionCard.displayName = 'SectionCard';

const styles = StyleSheet.create({
  premiumBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: withAlpha(Colors.bg, 0.82),
    borderWidth: 1,
    borderColor: Colors.brandCyan,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  premiumBadgeText: {
    color: Colors.brandCyan,
    fontSize: 11,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.6,
  },
  sectionCard: { width: 132, marginRight: 0 },
  sectionCardImg: {
    width: 132,
    height: 198,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
  },
  sectionCardTitle: {
    fontSize: 13,
    color: Colors.text,
    marginTop: 6,
    fontWeight: '600',
    lineHeight: 17,
  },
  shortCard: { width: 120, borderRadius: 8, overflow: 'hidden' },
  shortImg: { width: 120, height: 205, borderRadius: 8 },
  shortPlaceholder: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortTitle: { fontSize: 11, fontWeight: '600', color: Colors.text, marginTop: 4 },
});
