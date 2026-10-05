import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/theme';
import type { ChannelPost } from '@/lib/data/posts';
import { ManageCard, ManageCardTitle } from './ManageCard';

/** The channel's posts with type, status and date, each with a delete button. */
export function ManagedPostList({
  posts,
  onDelete,
}: {
  posts: ChannelPost[];
  onDelete: (post: ChannelPost) => void;
}) {
  return (
    <ManageCard>
      <ManageCardTitle>
        Content ({posts.length} {posts.length === 1 ? 'item' : 'items'})
      </ManageCardTitle>
      {posts.length === 0 ? (
        <Text style={styles.empty}>No content yet</Text>
      ) : (
        posts.map(post => (
          <View key={post.id} style={styles.item}>
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={1}>
                {post.title || 'Untitled'}
              </Text>
              <View style={styles.meta}>
                <Text style={styles.type}>{post.content_type}</Text>
                <Text style={styles.status}>{post.status}</Text>
                <Text style={styles.date}>{new Date(post.created_at).toLocaleDateString()}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => onDelete(post)} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>X</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ManageCard>
  );
}

const styles = StyleSheet.create({
  empty: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  info: { flex: 1, marginRight: 12 },
  title: { color: Colors.text, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  meta: { flexDirection: 'row', gap: 10 },
  type: {
    color: Colors.brandBlue,
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  status: { color: Colors.textSecondary, fontSize: 12, textTransform: 'capitalize' },
  date: { color: Colors.textMuted, fontSize: 12 },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 77, 109, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: { color: Colors.danger, fontSize: 14, fontWeight: '700' },
});
