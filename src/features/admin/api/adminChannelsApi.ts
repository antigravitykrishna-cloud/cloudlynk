import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';
import type { RpcRow } from '@/lib/rpcTypes';

export type AdminChannel = Pick<
  Tables<'channels'>,
  | 'id'
  | 'name'
  | 'description'
  | 'category'
  | 'is_public'
  | 'is_official'
  | 'status'
  | 'member_count'
  | 'post_count'
  | 'created_at'
>;
export type ChannelStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type ChannelActivity = RpcRow<'admin_list_channel_activity'>;
export type ChannelEdit = Pick<
  AdminChannel,
  'id' | 'name' | 'description' | 'category' | 'is_public' | 'is_official'
>;

const COLUMNS =
  'id, name, description, category, is_public, is_official, status, member_count, post_count, created_at';

/** Every channel, hidden, pending and suspended ones included (admins read all channels). */
export const adminChannelsApi = {
  async list(): Promise<AdminChannel[]> {
    const { data, error } = await supabase
      .from('channels')
      .select(COLUMNS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /** The channel admin uploads go to, by its is_official flag. Null if none exists yet. */
  async getOfficial(): Promise<{ id: string; name: string } | null> {
    const { data, error } = await supabase
      .from('channels')
      .select('id, name')
      .eq('is_official', true)
      .order('created_at')
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  },

  async update(channel: ChannelEdit): Promise<void> {
    const { error } = await supabase.rpc('admin_update_channel', {
      p_channel_id: channel.id,
      p_name: channel.name,
      p_description: channel.description ?? '',
      p_category: channel.category ?? '',
      p_is_public: channel.is_public,
      p_is_official: channel.is_official,
    });
    if (error) throw error;
  },

  /** Approve ('active'), reject, suspend or reinstate a channel. Audited. */
  async setStatus(channelId: string, status: ChannelStatus, reason?: string): Promise<void> {
    const { error } = await supabase.rpc('admin_set_channel_status', {
      p_channel_id: channelId,
      p_status: status,
      p_reason: reason,
    });
    if (error) throw error;
  },

  /** Members, content counts and last upload per channel, to see what is growing. */
  async listActivity(): Promise<ChannelActivity[]> {
    const { data, error } = await supabase.rpc('admin_list_channel_activity');
    if (error) throw error;
    return data ?? [];
  },
};
