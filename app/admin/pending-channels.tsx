import { useState, useCallback } from 'react';
import { fireHaptic } from '../../components/Press';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { formatFileSize, formatDuration } from '../../lib/channelVideos';

interface PendingChannel {
  id: string;
  name: string;
  owner_id: string;
  description: string | null;
  created_at: string;
  owner_email: string | null;
}

interface PendingVideo {
  id: string;
  channel_id: string;
  uploaded_by: string;
  storage_path: string;
  title: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  mime_type: string | null;
  created_at: string;
  channel_name: string | null;
  owner_email: string | null;
}

interface PendingPost {
  id: string;
  channel_id: string;
  author_id: string;
  title: string | null;
  content_type: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  created_at: string;
  channel_name: string | null;
  author_email: string | null;
}

export default function PendingChannelsScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [channels, setChannels] = useState<PendingChannel[]>([]);
  const [videos, setVideos] = useState<PendingVideo[]>([]);
  const [posts, setPosts] = useState<PendingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPending = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [channelResult, videoResult, postResult] = await Promise.all([
        supabase
          .from('channels')
          .select('id, name, owner_id, description, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('channel_videos')
          .select('id, channel_id, uploaded_by, storage_path, title, file_size_bytes, duration_seconds, mime_type, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('channel_posts')
          .select('id, channel_id, author_id, title, content_type, thumbnail_url, video_url, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);

      if (channelResult.error) throw channelResult.error;
      if (videoResult.error) throw videoResult.error;
      if (postResult.error) throw postResult.error;

      const channelRows = channelResult.data ?? [];
      const videoRows = videoResult.data ?? [];
      const postRows = postResult.data ?? [];

      const userIds = [...new Set([
        ...channelRows.map(r => r.owner_id),
        ...videoRows.map(r => r.uploaded_by),
        ...postRows.map(r => r.author_id),
      ])];
      const channelIds = [...new Set([
        ...videoRows.map(r => r.channel_id),
        ...postRows.map(r => r.channel_id),
      ])];

      let emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds);
        if (profiles) {
          emailMap = Object.fromEntries(profiles.map(p => [p.id, p.email]));
        }
      }

      let channelNameMap: Record<string, string> = {};
      if (channelIds.length > 0) {
        const { data: chans } = await supabase
          .from('channels')
          .select('id, name')
          .in('id', channelIds);
        if (chans) {
          channelNameMap = Object.fromEntries(chans.map(c => [c.id, c.name]));
        }
      }

      setChannels(channelRows.map(r => ({
        ...r,
        owner_email: emailMap[r.owner_id] ?? null,
      })));

      setVideos(videoRows.map(r => ({
        ...r,
        channel_name: channelNameMap[r.channel_id] ?? null,
        owner_email: emailMap[r.uploaded_by] ?? null,
      })));

      setPosts(postRows.map(r => ({
        ...r,
        channel_name: channelNameMap[r.channel_id] ?? null,
        author_email: emailMap[r.author_id] ?? null,
      })));
    } catch (err) {
      if (__DEV__) console.error('loadPending error:', err);
      // A moderation queue that renders "nothing here" after a failed
      // fetch is worse than one that errors: the admin concludes there is
      // nothing to review and stops checking, while the queue fills up.
      showAlert('Could not load pending channels', err instanceof Error ? err.message : 'Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useFocusEffect(useCallback(() => { setLoading(true); loadPending(); }, [loadPending]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPending();
    setRefreshing(false);
  }, [loadPending]);

/**
 * Set a channel's status, preferring the audited v64 RPC.
 *
 * admin_set_channel_status() re-checks admin standing server-side and writes
 * an admin_audit_log row, so "who published this channel, and when" has an
 * answer. It ships in migration v64.
 *
 * Until v64 is applied, PostgREST answers PGRST202 ("Could not find the
 * function") and we fall back to the direct UPDATE this screen used before.
 * Security is unchanged either way — v60's protect_channel_privileged_fields
 * trigger reverts a status write from anyone who is not an active admin. What
 * the fallback loses is the audit row, which is why it is a fallback.
 *
 * Delete this helper's fallback branch once v64 is deployed everywhere.
 */
async function setChannelStatus(channelId: string, status: 'active' | 'rejected') {
  const rpc = await supabase.rpc('admin_set_channel_status', {
    p_channel_id: channelId,
    p_status: status,
    p_reason: null,
  });

  const missing =
    rpc.error &&
    (rpc.error.code === 'PGRST202' || /could not find the function/i.test(rpc.error.message));

  if (!missing) return { error: rpc.error };

  const { error } = await supabase
    .from('channels')
    .update({ status })
    .eq('id', channelId);

  // 23514 is the CHECK violation on channels.status. Pre-v64 the constraint
  // is (pending, active, suspended) with no 'rejected', so rejecting cannot
  // work at all until the migration lands. Say that, rather than surfacing a
  // raw Postgres constraint string to an admin who cannot act on it.
  if (error && error.code === '23514') {
    return {
      error: {
        ...error,
        message:
          'Rejecting needs database migration v64. Run "npx supabase db push" — approving works without it.',
      },
    };
  }
  return { error };
}

  const handleApproveChannel = async (channel: PendingChannel) => {
    try {
      const { error } = await setChannelStatus(channel.id, 'active');
      if (error) throw error;
      setChannels(prev => prev.filter(c => c.id !== channel.id));
      fireHaptic('success');
      showAlert('Approved', `"${channel.name}" is now active.`);
    } catch (err: unknown) {
      fireHaptic('error');
      showAlert('Error', err instanceof Error ? err.message : 'Approve failed');
    }
  };

  const handleRejectChannel = (channel: PendingChannel) => {
    showAlert(
      'Reject Channel',
      `Are you sure? This will mark "${channel.name}" as rejected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject', style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await setChannelStatus(channel.id, 'rejected');
              if (error) throw error;
              setChannels(prev => prev.filter(c => c.id !== channel.id));
              fireHaptic('warning');
              showAlert('Rejected', `"${channel.name}" has been rejected.`);
            } catch (err: unknown) {
              fireHaptic('error');
              showAlert('Error', err instanceof Error ? err.message : 'Reject failed');
            }
          },
        },
      ],
    );
  };

  const handlePlayVideo = async (video: PendingVideo) => {
    try {
      const { data, error } = await supabase.storage
        .from('channel-videos')
        .createSignedUrl(video.storage_path, 3600);
      if (error || !data?.signedUrl) {
        fireHaptic('error');
        showAlert('Error', 'Could not generate preview URL.');
        return;
      }
      await Linking.openURL(data.signedUrl);
    } catch (err: unknown) {
      fireHaptic('error');
      showAlert('Error', err instanceof Error ? err.message : 'Could not open video.');
    }
  };

  const handleApproveVideo = async (video: PendingVideo) => {
    try {
      const { error } = await supabase
        .from('channel_videos')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', video.id);
      if (error) throw error;
      setVideos(prev => prev.filter(v => v.id !== video.id));
      fireHaptic('success');
      showAlert('Approved', `Video "${video.title ?? 'Untitled'}" is now approved.`);
    } catch (err: unknown) {
      fireHaptic('error');
      showAlert('Error', err instanceof Error ? err.message : 'Approve failed');
    }
  };

  const handleRejectVideo = (video: PendingVideo) => {
    showAlert(
      'Reject Video',
      `Reject "${video.title ?? 'Untitled'}"? Enter a reason if needed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject', style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('channel_videos')
                .update({
                  status: 'rejected',
                  rejection_reason: 'Rejected by admin',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', video.id);
              if (error) throw error;
              setVideos(prev => prev.filter(v => v.id !== video.id));
              fireHaptic('warning');
              showAlert('Rejected', 'Video has been rejected.');
            } catch (err: unknown) {
              fireHaptic('error');
              showAlert('Error', err instanceof Error ? err.message : 'Reject failed');
            }
          },
        },
      ],
    );
  };

  const handlePlayPost = async (post: PendingPost) => {
    if (!post.video_url) {
      showAlert('No video', 'This post has no video URL attached.');
      return;
    }
    try {
      await Linking.openURL(post.video_url);
    } catch (err: unknown) {
      fireHaptic('error');
      showAlert('Error', err instanceof Error ? err.message : 'Could not open video.');
    }
  };

  const handleApprovePost = async (post: PendingPost) => {
    try {
      const { error } = await supabase.rpc('approve_post', { p_post_id: post.id });
      if (error) throw error;
      setPosts(prev => prev.filter(p => p.id !== post.id));
      fireHaptic('success');
      showAlert('Approved', `"${post.title ?? 'Untitled'}" is now approved.`);
    } catch (err: unknown) {
      fireHaptic('error');
      showAlert('Error', err instanceof Error ? err.message : 'Approve failed');
    }
  };

  const handleRejectPost = (post: PendingPost) => {
    showAlert(
      'Reject Post',
      `Reject "${post.title ?? 'Untitled'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject', style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('reject_post', {
                p_post_id: post.id,
                p_reason: 'Rejected by admin',
              });
              if (error) throw error;
              setPosts(prev => prev.filter(p => p.id !== post.id));
              fireHaptic('warning');
              showAlert('Rejected', 'Post has been rejected.');
            } catch (err: unknown) {
              fireHaptic('error');
              showAlert('Error', err instanceof Error ? err.message : 'Reject failed');
            }
          },
        },
      ],
    );
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.headerBack} activeOpacity={0.7}>
            <Text style={styles.headerBackTxt}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Admin Queue</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Access denied</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={styles.headerBackTxt}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Queue</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.brand} size="large" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}
        >
          {/* Section 1: Pending Channels */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pending Channels</Text>
            {channels.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{channels.length}</Text>
              </View>
            )}
          </View>

          {channels.length === 0 ? (
            <Text style={styles.sectionEmpty}>No pending channels</Text>
          ) : (
            channels.map(channel => (
              <View key={channel.id} style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName} numberOfLines={1}>{channel.name}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {channel.owner_email ?? 'Unknown'} · {new Date(channel.created_at).toLocaleDateString()}
                  </Text>
                  {channel.description ? (
                    <Text style={styles.rowDesc} numberOfLines={2}>{channel.description}</Text>
                  ) : null}
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => handleApproveChannel(channel)} activeOpacity={0.7}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => handleRejectChannel(channel)} activeOpacity={0.7}>
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* Section 2: Pending Videos */}
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <Text style={styles.sectionTitle}>Pending Videos</Text>
            {videos.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{videos.length}</Text>
              </View>
            )}
          </View>

          {videos.length === 0 ? (
            <Text style={styles.sectionEmpty}>No pending videos</Text>
          ) : (
            videos.map(video => (
              <View key={video.id} style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName} numberOfLines={1}>{video.title ?? 'Untitled video'}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {video.channel_name ?? 'Unknown channel'} · {video.owner_email ?? 'Unknown'}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {formatFileSize(video.file_size_bytes ?? 0)} · {formatDuration(video.duration_seconds)} · {new Date(video.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={styles.playBtn} onPress={() => handlePlayVideo(video)} activeOpacity={0.7}>
                    <Text style={styles.playBtnText}>Play</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => handleApproveVideo(video)} activeOpacity={0.7}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => handleRejectVideo(video)} activeOpacity={0.7}>
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* Section 3: Pending Channel Posts */}
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <Text style={styles.sectionTitle}>Pending Channel Posts</Text>
            {posts.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{posts.length}</Text>
              </View>
            )}
          </View>

          {posts.length === 0 ? (
            <Text style={styles.sectionEmpty}>No pending channel posts</Text>
          ) : (
            posts.map(post => (
              <View key={post.id} style={styles.row}>
                <View style={styles.rowInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{post.title ?? 'Untitled'}</Text>
                    {post.content_type && (
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>{post.content_type.toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {post.channel_name ?? 'Unknown channel'} · {post.author_email ?? 'Unknown'}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {new Date(post.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  {post.video_url && (
                    <TouchableOpacity style={styles.playBtn} onPress={() => handlePlayPost(post)} activeOpacity={0.7}>
                      <Text style={styles.playBtnText}>Play</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprovePost(post)} activeOpacity={0.7}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => handleRejectPost(post)} activeOpacity={0.7}>
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { backgroundColor: Colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { color: '#ffffff', fontSize: 28, fontWeight: '700', lineHeight: 28 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  list: { paddingVertical: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  countBadge: { backgroundColor: '#FFB347', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: '#ffffff' },
  sectionEmpty: { fontSize: 13, color: Colors.textMuted, fontWeight: '500', paddingHorizontal: 16, paddingVertical: 16 },
  row: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  rowInfo: { marginBottom: 10 },
  rowName: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  rowMeta: { fontSize: 12, color: Colors.textMuted, fontWeight: '500', marginBottom: 2 },
  rowDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  rowActions: { flexDirection: 'row', gap: 10 },
  playBtn: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  playBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  approveBtn: { backgroundColor: '#2ED47A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  approveBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  rejectBtn: { backgroundColor: '#2A1620', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.brand },
  rejectBtnText: { color: Colors.brand, fontSize: 13, fontWeight: '700' },
  typeBadge: { backgroundColor: Colors.brandLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.brand, letterSpacing: 0.3 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, color: Colors.text, fontWeight: '600' },
});
