import { View, Text, StyleSheet, FlatList } from 'react-native';
import { memo } from 'react';
import { ChannelPost } from '@/features/content/api/postsApi';
import { Colors } from '@/theme';
import { ContentCard } from '@/features/channels/components/ContentCard';

export const GenreRow = memo(
  ({
    genre,
    items,
    onSelect,
  }: {
    genre: string;
    items: ChannelPost[];
    onSelect: (item: ChannelPost) => void;
  }) => (
    <View style={styles.genreSection}>
      <Text style={styles.genreLabel}>{genre}</Text>
      <FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.genreRow}
        renderItem={({ item }) => <ContentCard item={item} onPress={() => onSelect(item)} />}
      />
    </View>
  ),
);
GenreRow.displayName = 'GenreRow';

const styles = StyleSheet.create({
  genreSection: { marginTop: 28 },
  genreLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    paddingHorizontal: 16,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  genreRow: { paddingHorizontal: 16, gap: 10 },
});
