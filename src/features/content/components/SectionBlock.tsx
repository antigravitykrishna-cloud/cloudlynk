import { View, Text, StyleSheet, FlatList } from 'react-native';
import { memo } from 'react';
import type { ChannelPost } from '@/features/content/model';
import type { Shelf } from '@/features/content/shelves';
import { Colors, FontWeight, Radius } from '@/theme';
import { HeroCard } from '@/features/content/components/HeroCard';
import { SectionCard } from '@/features/content/components/SectionCard';

/** One Explore shelf. "Featured" opens with a full-width hero; every other shelf is a carousel. */
export const SectionBlock = memo(
  ({ shelf, onSelect }: { shelf: Shelf; onSelect: (item: ChannelPost) => void }) => {
    const { title: sectionKey, items } = shelf;
    const isShorts = sectionKey === 'Shorts';

    // Featured is the hero, not a row. Its first item gets the full-width
    // treatment; anything after it falls through to the normal carousel so a
    // second featured title is not silently dropped.
    if (sectionKey === 'Featured' && items.length > 0) {
      const [lead, ...rest] = items;
      return (
        <View style={styles.sectionBlock}>
          <HeroCard item={lead} onPress={() => onSelect(lead)} />
          {rest.length > 0 && (
            <FlatList
              data={rest}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={i => i.id}
              contentContainerStyle={styles.sectionRow}
              renderItem={({ item }) => (
                <SectionCard item={item} isShorts={false} onPress={() => onSelect(item)} />
              )}
            />
          )}
        </View>
      );
    }

    return (
      <View style={styles.sectionBlock}>
        <View style={styles.shortsHeader}>
          <Text style={styles.shortsTitle}>{sectionKey}</Text>
          {isShorts && (
            <View style={styles.shortsBadge}>
              <Text style={styles.shortsBadgeText}>FREE</Text>
            </View>
          )}
        </View>
        <FlatList
          data={items}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.sectionRow}
          initialNumToRender={5}
          maxToRenderPerBatch={8}
          windowSize={3}
          renderItem={({ item }) => (
            <SectionCard item={item} isShorts={isShorts} onPress={() => onSelect(item)} />
          )}
        />
      </View>
    );
  },
);
SectionBlock.displayName = 'SectionBlock';

const styles = StyleSheet.create({
  sectionBlock: { marginBottom: 22 },
  sectionRow: { paddingHorizontal: 16, gap: 12 },
  shortsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  shortsTitle: {
    fontSize: 19,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  shortsBadge: {
    backgroundColor: Colors.successDim,
    borderWidth: 1,
    borderColor: Colors.success,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  shortsBadgeText: {
    fontSize: 11,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    letterSpacing: 0.8,
  },
});
