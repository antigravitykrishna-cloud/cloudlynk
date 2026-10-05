import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';
import type { ChannelPost } from '@/features/content/model';
import { adminChannelsApi } from '@/features/admin/api/adminChannelsApi';

// guards-allow-select-star -- admin-only reads; anon never reaches these.
// The review queue: new channels, new posts, and the legacy storage-hosted channel videos that
// predate Cloudflare Stream. Admins read every row through the admin policies.

export type PendingChannel = Pick<
  Tables<'channels'>,
  'id' | 'name' | 'description' | 'is_public' | 'created_at' | 'owner_id'
> & { owner: { id: string; full_name: string | null; email: string } | null };

export type PendingPost = ChannelPost;

export type PendingLegacyVideo = Pick<
  Tables<'channel_videos'>,
  | 'id'
  | 'channel_id'
  | 'uploaded_by'
  | 'storage_path'
  | 'title'
  | 'file_size_bytes'
  | 'duration_seconds'
  | 'created_at'
> & { channelName: string | null; uploaderEmail: string | null };

/** Reason stored on a rejection when the admin gives none. */
export const DEFAULT_REJECTION_REASON = 'Does not meet content guidelines.';

const LEGACY_PREVIEW_SECONDS = 60 * 60;

export const adminModerationApi = {
  async listPendingChannels(): Promise<PendingChannel[]> {
    const { data, error } = await supabase
      .from('channels')
      // The hint is required: channels reach profiles both through owner_id and through the
      // channel_members junction, and PostgREST refuses (PGRST201) to guess which.
      .select(
        'id, name, description, is_public, created_at, owner_id, owner:profiles!channels_owner_id_fkey(id, full_name, email)',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as PendingChannel[];
  },

  async listPendingPosts(): Promise<PendingPost[]> {
    const { data, error } = await supabase
      .from('channel_posts')
      .select(
        '*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url), channel:channels(name)',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PendingPost[];
  },

  async listPendingLegacyVideos(): Promise<PendingLegacyVideo[]> {
    const { data, error } = await supabase
      .from('channel_videos')
      .select(
        'id, channel_id, uploaded_by, storage_path, title, file_size_bytes, duration_seconds, created_at',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const videos = data ?? [];
    if (videos.length === 0) return [];

    const [{ data: channels }, { data: uploaders }] = await Promise.all([
      supabase
        .from('channels')
        .select('id, name')
        .in('id', [...new Set(videos.map(video => video.channel_id))]),
      supabase
        .from('profiles')
        .select('id, email')
        .in('id', [...new Set(videos.map(video => video.uploaded_by))]),
    ]);
    const channelName = new Map((channels ?? []).map(channel => [channel.id, channel.name]));
    const email = new Map((uploaders ?? []).map(profile => [profile.id, profile.email]));
    return videos.map(video => ({
      ...video,
      channelName: channelName.get(video.channel_id) ?? null,
      uploaderEmail: email.get(video.uploaded_by) ?? null,
    }));
  },

  approveChannel: (channelId: string) => adminChannelsApi.setStatus(channelId, 'active'),

  rejectChannel: (channelId: string) => adminChannelsApi.setStatus(channelId, 'rejected'),

  async approvePost(postId: string): Promise<void> {
    const { error } = await supabase.rpc('approve_post', { p_post_id: postId });
    if (error) throw error;
  },

  async rejectPost(postId: string, reason = DEFAULT_REJECTION_REASON): Promise<void> {
    const { error } = await supabase.rpc('reject_post', { p_post_id: postId, p_reason: reason });
    if (error) throw error;
  },

  async setLegacyVideoStatus(videoId: string, status: 'approved' | 'rejected'): Promise<void> {
    const { error } = await supabase
      .from('channel_videos')
      .update({
        status,
        rejection_reason: status === 'rejected' ? 'Rejected by admin' : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId);
    if (error) throw error;
  },

  /** A one-hour link to watch a legacy video before deciding. */
  async legacyVideoPreviewUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from('channel-videos')
      .createSignedUrl(storagePath, LEGACY_PREVIEW_SECONDS);
    if (error || !data?.signedUrl) throw error ?? new Error('Could not create a preview link.');
    return data.signedUrl;
  },
};
