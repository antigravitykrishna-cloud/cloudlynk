import { supabase } from '@/lib/supabase';

// Reporting and blocking, required by Google Play's User Generated Content policy. Reports land in
// the admin moderation queue (features/admin/api/adminReportsApi.ts); blocks live in `user_blocks`.

/** Postgres unique violation: the block already exists. */
const ALREADY_EXISTS = '23505';

export const safetyApi = {
  /** Reports one post. A copyright claim is filed as its own type so admins can triage it. */
  async reportPost(input: {
    channelId: string;
    reporterId: string;
    reason: string;
    postId: string;
    authorId: string;
  }): Promise<void> {
    const { error } = await supabase.from('content_reports').insert({
      channel_id: input.channelId,
      reporter_id: input.reporterId,
      reason: input.reason,
      target_type: input.reason === 'copyright_violation' ? 'copyright' : 'content',
      status: 'pending',
      post_id: input.postId,
      reported_user_id: input.authorId,
    });
    if (error) throw error;
  },

  /** Reports an account's behaviour in general (spam, harassment), not one post. */
  async reportUser(reporterId: string, reportedUserId: string, reason: string): Promise<void> {
    const { error } = await supabase.from('content_reports').insert({
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      reason,
      target_type: 'user',
      status: 'pending',
    });
    if (error) throw error;
  },

  /** Hides everything `blockedId` uploads from `blockerId`. Blocking twice is not an error. */
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    const { error } = await supabase
      .from('user_blocks')
      .insert({ blocker_id: blockerId, blocked_id: blockedId });
    if (error && error.code !== ALREADY_EXISTS) throw error;
  },

  async listBlockedUserIds(blockerId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', blockerId);
    if (error) throw error;
    return (data ?? []).map(row => row.blocked_id);
  },
};
