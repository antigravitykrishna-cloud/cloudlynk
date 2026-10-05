import { StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import type { ChannelPost } from '@/features/content/model';

/** The channel's uploads still waiting for an admin, shown to the owner and admins. */
export function PendingReviewList({ posts }: { posts: ChannelPost[] }) {
  if (posts.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>⏳ Pending Review</Text>
      {posts.map(post => (
        <View key={post.id} style={styles.card}>
          <Text style={styles.title}>{post.title ?? 'Untitled'}</Text>
          <Text style={styles.meta}>{post.content_type?.toUpperCase()} · Submitted for review</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: Spacing.lg, marginTop: Spacing.xl },
  heading: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.warningDim,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  meta: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.semibold },
});
