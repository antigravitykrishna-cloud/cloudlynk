import { memo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import type { ChannelPost } from '@/features/content/model';
import type { Shelf } from '@/features/content/shelves';
import { PostCard } from '@/features/channels/components/PostCard';

/** One titled, horizontally scrolling row of posters on a channel page. */
export const PostShelf = memo(function PostShelf({
  shelf,
  onSelect,
}: {
  shelf: Shelf;
  onSelect: (post: ChannelPost) => void;
}) {
  return (
    <View style={styles.shelf}>
      <Text style={styles.title}>{shelf.title}</Text>
      <FlatList
        data={shelf.items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={post => post.id}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => <PostCard post={item} onPress={() => onSelect(item)} />}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  shelf: { marginTop: 28 },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    letterSpacing: -0.3,
  },
  row: { paddingHorizontal: Spacing.lg, gap: 10 },
});
