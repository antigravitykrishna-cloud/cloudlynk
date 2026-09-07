import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { showAlert } from '../../../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { ChannelService } from '../../../lib/channels';
import { PostService, ChannelPost } from '../../../lib/posts';
import { supabase } from '../../../lib/supabase';
import { Colors } from '../../../constants/theme';

export default function ManageChannelScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user, profile, isAdmin } = useAuth();

  const [channel, setChannel] = useState<any>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const loadChannel = useCallback(async () => {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      showAlert('Error', 'Failed to load channel');
      router.replace('/(tabs)/channels');
      return;
    }

    setChannel(data);
    setEditName(data.name || '');
    setEditDesc(data.description || '');
  }, [id]);

  const loadPosts = useCallback(async () => {
    if (!user) return;
    try {
      const data = await PostService.getChannelPosts(id as string, user.id);
      setPosts(data);
    } catch (err) {
      if (__DEV__) console.error('Failed to load posts:', err);
    }
  }, [id, user]);

  useEffect(() => {
    if (!user) return;

    const init = async () => {
      setLoading(true);
      await loadChannel();
      await loadPosts();
      setLoading(false);
    };

    init();
  }, [user, loadChannel, loadPosts]);

  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== user?.id) {
      setChannel(null);
      setPosts([]);
      setLoading(true);
    }
    prevUserIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    if (profile === null) return;
    if (channel && user && channel.owner_id !== user.id && !isAdmin) {
      showAlert('Access Denied', 'You can only manage your own channels.');
      router.replace('/(tabs)/channels');
    }
  }, [channel, user, isAdmin, profile]);

  const handleSave = async () => {
    if (!editName.trim()) {
      showAlert('Error', 'Channel name cannot be empty');
      return;
    }

    setSaving(true);
    try {
      const updated = await ChannelService.updateChannel(
        id as string,
        editName.trim(),
        editDesc.trim()
      );
      setChannel(updated);
      setEditing(false);
      showAlert('Success', 'Channel updated successfully');
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to update channel');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    showAlert(
      'Delete Channel',
      'Are you sure you want to delete this channel? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ChannelService.deleteChannel(id as string);
              showAlert('Deleted', 'Channel has been deleted.');
              router.replace('/(tabs)/channels');
            } catch (err: any) {
              showAlert('Error', err.message || 'Failed to delete channel');
            }
          },
        },
      ]
    );
  };

  const handleDeletePost = (postId: string, postTitle: string | null) => {
    showAlert(
      'Delete Post',
      `Are you sure you want to delete "${postTitle || 'Untitled'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('channel_posts')
                .delete()
                .eq('id', postId);

              if (error) throw error;
              setPosts((prev) => prev.filter((p) => p.id !== postId));
            } catch (err: any) {
              showAlert('Error', err.message || 'Failed to delete post');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#2E7DFF" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!channel) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Channel not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/channels')} style={styles.backButton}>
          <Text style={styles.backButtonText}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Channel</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Channel Info Card */}
        <View style={styles.card}>
          <Text style={styles.channelName}>{channel.name}</Text>

          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    channel.status === 'active'
                      ? 'rgba(34, 197, 94, 0.15)'
                      : 'rgba(234, 179, 8, 0.15)',
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color: channel.status === 'active' ? '#2ED47A' : '#EAB308',
                  },
                ]}
              >
                {channel.status}
              </Text>
            </View>

            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {channel.is_public ? 'Public' : 'Private'}
              </Text>
            </View>

            {channel.member_count !== undefined && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {channel.member_count} members
                </Text>
              </View>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.addContentBtn}
          onPress={() => router.push({ pathname: '/upload/add-content', params: { channelId: id as string } })}
          activeOpacity={0.7}
        >
          <Text style={styles.addContentBtnText}>+ Add Content</Text>
        </TouchableOpacity>

        {/* Edit Form */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Channel Details</Text>
            {!editing && (
              <TouchableOpacity onPress={() => setEditing(true)}>
                <Text style={styles.editButton}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {editing ? (
            <View>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Channel name"
                placeholderTextColor="#6B7C97"
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editDesc}
                onChangeText={setEditDesc}
                placeholder="Channel description"
                placeholderTextColor="#6B7C97"
                multiline
                numberOfLines={4}
              />

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditing(false);
                    setEditName(channel.name || '');
                    setEditDesc(channel.description || '');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.disabledButton]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              <Text style={styles.detailLabel}>Name</Text>
              <Text style={styles.detailValue}>{channel.name}</Text>
              <Text style={styles.detailLabel}>Description</Text>
              <Text style={styles.detailValue}>
                {channel.description || 'No description'}
              </Text>
            </View>
          )}
        </View>

        {/* Content List */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Content ({posts.length} {posts.length === 1 ? 'item' : 'items'})
          </Text>

          {posts.length === 0 ? (
            <Text style={styles.emptyText}>No content yet</Text>
          ) : (
            posts.map((post) => (
              <View key={post.id} style={styles.postItem}>
                <View style={styles.postInfo}>
                  <Text style={styles.postTitle} numberOfLines={1}>
                    {post.title || 'Untitled'}
                  </Text>
                  <View style={styles.postMeta}>
                    <Text style={styles.postType}>{post.content_type}</Text>
                    <Text style={styles.postStatus}>{post.status}</Text>
                    <Text style={styles.postDate}>
                      {new Date(post.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeletePost(post.id, post.title)}
                  style={styles.deletePostButton}
                >
                  <Text style={styles.deletePostButtonText}>X</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Delete Channel Button */}
        <TouchableOpacity style={styles.deleteChannelButton} onPress={handleDelete}>
          <Text style={styles.deleteChannelButtonText}>Delete Channel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#22304A',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  addContentBtn: {
    borderWidth: 1.5,
    borderColor: '#2E7DFF',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  addContentBtnText: {
    color: '#2E7DFF',
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#182437',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#22304A',
  },
  channelName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  badgeText: {
    color: '#9FB0C9',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  editButton: {
    color: '#2E7DFF',
    fontSize: 14,
    fontWeight: '600',
  },
  label: {
    color: '#9FB0C9',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#22304A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#22304A',
  },
  cancelButtonText: {
    color: '#9FB0C9',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2E7DFF',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  detailLabel: {
    color: '#6B7C97',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 10,
    marginBottom: 2,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  emptyText: {
    color: '#6B7C97',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  postItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#22304A',
  },
  postInfo: {
    flex: 1,
    marginRight: 12,
  },
  postTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  postMeta: {
    flexDirection: 'row',
    gap: 10,
  },
  postType: {
    color: '#2E7DFF',
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  postStatus: {
    color: '#9FB0C9',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  postDate: {
    color: '#6B7C97',
    fontSize: 12,
  },
  deletePostButton: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 77, 109, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletePostButtonText: {
    color: '#FF4D6D',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteChannelButton: {
    backgroundColor: '#FF4D6D',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  deleteChannelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#FF4D6D',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
});
