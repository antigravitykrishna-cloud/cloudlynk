import { supabase } from '@/lib/supabase';
import type { ChannelPost } from '@/features/content/model';

// guards-allow-select-star
// Admin-only reads: the admin policies return every row, and anon never reaches these.

/** A channel waiting for approval, with its owner. */
export type PendingChannel = {
  id: string;
  name: string;
  owner_id: string;
  description: string | null;
  created_at: string;
  owner?: { id: string; full_name: string | null; email: string } | null;
};

/** The review queue for new channels and new posts. */
export const adminModerationApi = {
  async listPendingChannels(): Promise<PendingChannel[]> {
    const { data, error } = await supabase
      .from('channels')
      // The hint is required: channels reach profiles both through owner_id and through the
      // channel_members junction, and PostgREST refuses (PGRST201) to guess which.
      .select('*, owner:profiles!channels_owner_id_fkey(id, full_name, email)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PendingChannel[];
  },

  async listPendingPosts(): Promise<ChannelPost[]> {
    const { data, error } = await supabase
      .from('channel_posts')
      .select(
        '*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url), channel:channels(name)',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ChannelPost[];
  },

  async approveChannel(channelId: string): Promise<void> {
    const { error } = await supabase
      .from('channels')
      .update({ status: 'active' })
      .eq('id', channelId);
    if (error) throw error;
  },

  async rejectChannel(channelId: string): Promise<void> {
    const { error } = await supabase
      .from('channels')
      .update({ status: 'suspended' })
      .eq('id', channelId);
    if (error) throw error;
  },

  async approvePost(postId: string, adminId: string): Promise<void> {
    const { error } = await supabase
      .from('channel_posts')
      .update({
        status: 'approved',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        rejection_note: null,
      })
      .eq('id', postId);
    if (error) throw error;
  },

  async rejectPost(postId: string, adminId: string, note?: string): Promise<void> {
    const { error } = await supabase
      .from('channel_posts')
      .update({
        status: 'rejected',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        rejection_note: note ?? null,
      })
      .eq('id', postId);
    if (error) throw error;
  },
};
