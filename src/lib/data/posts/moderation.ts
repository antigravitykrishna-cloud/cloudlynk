import { supabase } from '@/lib/supabase';
import { ChannelPost } from './types';

// guards-allow-select-star
// Admin-only: every function here runs authenticated as an admin (RLS enforces it).

export async function getPendingPosts(): Promise<ChannelPost[]> {
  const { data, error } = await supabase
    .from('channel_posts')
    .select(
      '*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url), channel:channels(name)',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChannelPost[];
}

export async function getPendingChannels() {
  const { data, error } = await supabase
    .from('channels')
    // !channels_owner_id_fkey is required: PostgREST sees two channels→profiles
    // paths (the owner_id FK and the channel_members m2m junction) and errors
    // PGRST201 without an explicit hint.
    .select('*, owner:profiles!channels_owner_id_fkey(id, full_name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function approveChannel(channelId: string) {
  const { error } = await supabase
    .from('channels')
    .update({ status: 'active' })
    .eq('id', channelId);
  if (error) throw error;
}

export async function rejectChannel(channelId: string) {
  const { error } = await supabase
    .from('channels')
    .update({ status: 'suspended' })
    .eq('id', channelId);
  if (error) throw error;
}

export async function approvePost(postId: string, adminId: string) {
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
}

export async function rejectPost(postId: string, adminId: string, note?: string) {
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
}
