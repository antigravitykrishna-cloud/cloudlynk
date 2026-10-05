import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

// guards-allow-select-star
// getMyChannels / getMyOwnedChannels are membership and ownership queries keyed to a user id.
// getDiscoverChannels, the one path guests DO hit, names its columns via CHANNEL_LIST_COLUMNS.
// See scripts/guards.mjs check 2 for why select('*') is unsafe on a
// guest-reachable path.

/**
 * The columns the channel lists render -- a subset of what guests may read. Selecting a column a
 * role cannot read fails the whole request (it is not nulled), so select('*') would return nothing
 * for guests. Works for signed-in users too.
 */
export const CHANNEL_LIST_COLUMNS =
  'id, owner_id, name, description, category, is_public, is_official, ' +
  'status, member_count, post_count, created_at';

export const ChannelService = {
  async createChannel(
    ownerId: string,
    name: string,
    description: string,
    isPublic: boolean,
    link?: string,
    category?: string,
  ) {
    const approvalExpiry = new Date();
    approvalExpiry.setDate(approvalExpiry.getDate() + 7);

    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .insert({
        owner_id: ownerId,
        name,
        description,
        is_public: isPublic,
        status: 'pending',
        approval_expires_at: approvalExpiry.toISOString(),
        link: link?.trim() || null,
        category: category ?? null,
      })
      .select()
      .single();

    if (channelError) throw channelError;

    // Auto-join owner as owner
    await supabase.from('channel_members').insert({
      channel_id: channel.id,
      user_id: ownerId,
      role: 'owner',
    });

    return channel;
  },

  async getMyChannels(userId: string) {
    const { data, error } = await supabase
      .from('channel_members')
      .select(
        `
        role,
        channels(*)
      `,
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false, referencedTable: 'channels' });

    if (error) throw error;
    return (data ?? []).map(row => ({ ...row.channels, myRole: row.role })).filter(Boolean);
  },

  async getMyOwnedChannels(userId: string) {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  },

  async getDiscoverChannels(_userId: string, filter?: 'top_rated' | 'trending' | 'latest') {
    let query = supabase
      .from('channels')
      .select(CHANNEL_LIST_COLUMNS)
      .eq('is_public', true)
      .in('status', ['active', 'pending']);

    if (filter === 'top_rated') {
      query = query
        .order('member_count', { ascending: false })
        .order('post_count', { ascending: false });
    } else if (filter === 'trending') {
      query = query
        .order('post_count', { ascending: false })
        .order('member_count', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query.limit(30);
    if (error) throw error;
    return data ?? [];
  },

  async joinChannel(channelId: string, _userId: string) {
    const { error } = await supabase.rpc('join_channel', { p_channel_id: channelId });
    if (error) throw error;
  },

  async leaveChannel(channelId: string, _userId: string) {
    const { error } = await supabase.rpc('leave_channel', { p_channel_id: channelId });
    if (error) throw error;
  },

  /** Returns the updated channel row (update_channel returns it as JSON). */
  async updateChannel(
    channelId: string,
    name: string,
    description: string,
  ): Promise<Tables<'channels'>> {
    const { data, error } = await supabase.rpc('update_channel', {
      p_channel_id: channelId,
      p_name: name,
      p_description: description,
    });
    if (error) throw error;
    return data as unknown as Tables<'channels'>;
  },

  async deleteChannel(channelId: string) {
    const { error } = await supabase.rpc('delete_channel', {
      p_channel_id: channelId,
    });
    if (error) throw error;
  },

  async reportContent(
    channelId: string,
    reporterId: string,
    reason: string,
    opts?: { postId?: string; reportedUserId?: string },
  ) {
    // target_type drives the admin moderation queue's filtering/grouping
    // (see AdminModerationService + app/admin/reports.tsx) — added in v48
    // but never actually set on insert until now, so every report filed
    // through this path had target_type=NULL.
    const targetType = reason === 'copyright_violation' ? 'copyright' : 'content';
    const { error } = await supabase.from('content_reports').insert({
      channel_id: channelId,
      reporter_id: reporterId,
      reason,
      target_type: targetType,
      status: 'pending',
      post_id: opts?.postId ?? null,
      reported_user_id: opts?.reportedUserId ?? null,
    });
    if (error) throw error;
  },

  getDaysRemaining(approvalExpiresAt: string | null): number {
    if (!approvalExpiresAt) return 0;
    const diff = new Date(approvalExpiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  },
};

// Reporting a user (their behaviour in general), separate from reporting one post. Shown to admins
// as target_type 'user' in the moderation queue.
export const ReportService = {
  async reportUser(reporterId: string, reportedUserId: string, reason: string) {
    const { error } = await supabase.from('content_reports').insert({
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      reason,
      target_type: 'user',
      status: 'pending',
    });
    if (error) throw error;
  },
};

// Blocking — required by Play's User Generated Content policy for apps with
// public social/UGC surfaces. Backed by `user_blocks`
// (supabase/migrations/20260824120000_v46_compliance_hardening.sql).
export const BlockService = {
  async blockUser(blockerId: string, blockedId: string) {
    const { error } = await supabase
      .from('user_blocks')
      .insert({ blocker_id: blockerId, blocked_id: blockedId });
    if (error && error.code !== '23505') throw error; // ignore "already blocked"
  },

  async unblockUser(blockerId: string, blockedId: string) {
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);
    if (error) throw error;
  },

  async getBlockedUserIds(blockerId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', blockerId);
    if (error) throw error;
    return (data ?? []).map(row => row.blocked_id as string);
  },

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocker_id')
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  },
};
