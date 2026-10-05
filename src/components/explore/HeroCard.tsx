import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/Press';
import { PostService, ChannelPost } from '@/lib/data/posts';
import { Colors, Radius, FontWeight } from '@/constants/theme';

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
export const HeroCard = memo(({ item, onPress }: { item: ChannelPost; onPress: () => void }) => {
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
          <Icon
            name={item.content_type === 'series' ? 'tv' : 'film'}
            size={56}
            color={Colors.textMuted}
          />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(11,18,32,0.55)', 'rgba(11,18,32,0.97)']}
        locations={[0, 0.45, 1]}
        style={styles.heroScrim}
      />
      <View style={styles.heroBody}>
        {item.access_level === 'premium' ? (
          <View style={styles.heroTag}>
            <Text style={styles.heroTagText}>PREMIUM</Text>
          </View>
        ) : (
          <View style={[styles.heroTag, styles.heroTagFree]}>
            <Text style={styles.heroTagText}>FREE</Text>
          </View>
        )}
        <Text style={styles.heroTitle} numberOfLines={2}>
          {item.title ?? 'Untitled'}
        </Text>
        {item.genre ? (
          <Text style={styles.heroMeta} numberOfLines={1}>
            {item.genre}
          </Text>
        ) : null}
        <View style={styles.heroPlay}>
          <Icon name="play" size={16} color={Colors.textInverse} filled />
          <Text style={styles.heroPlayText}>Play</Text>
        </View>
      </View>
    </PressScale>
  );
});
HeroCard.displayName = 'HeroCard';

const styles = StyleSheet.create({
  hero: {
    height: 460,
    marginBottom: 20,
    backgroundColor: Colors.surface,
    position: 'relative',
  },
  heroImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroBody: { position: 'absolute', left: 20, right: 20, bottom: 22 },
  heroTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,212,255,0.16)',
    borderWidth: 1,
    borderColor: Colors.brandCyan,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  heroTagFree: {
    backgroundColor: 'rgba(46,212,122,0.16)',
    borderColor: Colors.success,
  },
  heroTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 35,
  },
  heroMeta: { color: Colors.textSecondary, fontSize: 14, marginTop: 6 },
  heroPlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.full,
    paddingHorizontal: 22,
    paddingVertical: 11,
    marginTop: 16,
  },
  heroPlayText: { color: Colors.textInverse, fontSize: 15, fontWeight: FontWeight.bold },
  heroPlaceholder: { backgroundColor: '#182437', alignItems: 'center', justifyContent: 'center' },
});
