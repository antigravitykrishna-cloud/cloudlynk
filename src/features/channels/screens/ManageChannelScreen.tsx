import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { formatDate } from '@/utils/format';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ChannelDetailsCard } from '@/features/channels/components/ChannelDetailsCard';
import { useManagedChannel } from '@/features/channels/hooks/useManagedChannel';
import type { ChannelPost } from '@/features/content/model';

// An owner's (or admin's) view of one channel: its details, every post with a delete button, and
// deleting the channel itself.

export default function ManageChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { channel, posts, loading, saveDetails, deleteChannel, deletePost } = useManagedChannel(id);

  const confirmDeleteChannel = () =>
    showAlert(
      'Delete Channel',
      'Are you sure you want to delete this channel? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteChannel()
              .then(() => showAlert('Deleted', 'Channel has been deleted.'))
              .catch(err => showAlert('Error', err?.message || 'Failed to delete channel')),
        },
      ],
    );

  const confirmDeletePost = (post: ChannelPost) =>
    showAlert('Delete Post', `Are you sure you want to delete "${post.title || 'Untitled'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deletePost(post.id).catch(err =>
            showAlert('Error', err?.message || 'Failed to delete post'),
          ),
      },
    ]);

  return (
    <SafeAreaView style={styles.page}>
      <ScreenHeader title="Manage Channel" onBack={() => router.replace('/(tabs)/channels')} />

      {loading ? (
        <ActivityIndicator size="large" color={Colors.brandBlue} style={styles.spinner} />
      ) : !channel ? (
        <EmptyState icon="broadcast" title="Channel not found" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <Text style={styles.channelName}>{channel.name}</Text>
            <View style={styles.chips}>
              <Chip label={channel.status} tone={channel.status === 'active' ? 'good' : 'warn'} />
              <Chip label={channel.is_public ? 'Public' : 'Private'} />
              <Chip label={`${channel.member_count ?? 0} members`} />
            </View>
          </Card>

          {isAdmin && (
            <Button
              label="+ Add Content"
              variant="outline"
              onPress={() =>
                router.push({ pathname: '/upload/add-content', params: { channelId: id } })
              }
              style={styles.addContent}
            />
          )}

          <ChannelDetailsCard key={channel.id} channel={channel} onSave={saveDetails} />

          <Card>
            <Text style={styles.sectionTitle}>
              Content ({posts.length} {posts.length === 1 ? 'item' : 'items'})
            </Text>
            {posts.length === 0 ? (
              <Text style={styles.muted}>No content yet</Text>
            ) : (
              posts.map(post => (
                <View key={post.id} style={styles.postRow}>
                  <View style={styles.postInfo}>
                    <Text style={styles.postTitle} numberOfLines={1}>
                      {post.title || 'Untitled'}
                    </Text>
                    <Text style={styles.muted}>
                      {post.content_type} · {post.status} · {formatDate(post.created_at)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => confirmDeletePost(post)}
                    style={styles.deletePost}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${post.title || 'post'}`}
                  >
                    <Text style={styles.deletePostText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </Card>

          <Button label="Delete Channel" variant="danger" onPress={confirmDeleteChannel} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: 40 },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  channelName: {
    color: Colors.text,
    fontSize: FontSize.title,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  addContent: { marginBottom: Spacing.lg, borderStyle: 'dashed' },
  sectionTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.md,
  },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  postInfo: { flex: 1, marginRight: Spacing.md },
  postTitle: { color: Colors.text, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  deletePost: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dangerDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletePostText: { color: Colors.danger, fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
