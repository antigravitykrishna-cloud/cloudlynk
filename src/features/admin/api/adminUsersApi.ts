import { supabase } from '@/lib/supabase';
import type { RpcRow } from '@/lib/rpcTypes';

// Accounts, approvals, subscribers and announcements. Every RPC re-checks is_active_admin() and
// writes admin_audit_log on the server; the app's admin checks only keep the screens tidy.

export type AdminUserSummary = RpcRow<'admin_search_users'>;

/** admin_get_user returns one jsonb object with this shape. */
export type AdminUserDetail = AdminUserSummary & {
  is_admin: boolean;
  can_upload_content: boolean;
  plan_started_at: string | null;
  plan_active: boolean;
  channels_owned: number;
  channels_joined: number;
  posts: number;
  payments_paid: number;
  last_payment_at: string | null;
};

export type PlanAction =
  { action: 'add_days'; days: number } | { action: 'lifetime' } | { action: 'revoke' };
export type AccountStatus = 'active' | 'suspended' | 'banned';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalRow = RpcRow<'admin_list_user_approvals'>;

export type SubscriberCohort = 'expired' | 'expiring' | 'active' | 'cancelled' | 'free';
export type SubscriberRow = RpcRow<'admin_list_subscribers'>;
export type SubscriberCounts = RpcRow<'admin_subscriber_counts'>;

/** What one person can watch through admin grants (as opposed to a plan). */
export type UserGrant = RpcRow<'admin_get_user_grants'>;
export type ProfileSummary = RpcRow<'admin_get_profiles_by_ids'>;

export type BroadcastAudience = 'all' | 'premium' | 'free';

export const adminUsersApi = {
  async search(query: string, limit = 50): Promise<AdminUserSummary[]> {
    const { data, error } = await supabase.rpc('admin_search_users', {
      p_query: query.trim() || undefined,
      p_limit: limit,
    });
    if (error) throw error;
    return data ?? [];
  },

  async get(userId: string): Promise<AdminUserDetail> {
    const { data, error } = await supabase.rpc('admin_get_user', { p_user_id: userId });
    if (error) throw error;
    return data as unknown as AdminUserDetail;
  },

  async getProfilesByIds(ids: string[]): Promise<ProfileSummary[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.rpc('admin_get_profiles_by_ids', { p_ids: ids });
    if (error) throw error;
    return data ?? [];
  },

  async setPlan(userId: string, plan: PlanAction): Promise<void> {
    const { error } = await supabase.rpc('admin_set_user_plan', {
      p_user_id: userId,
      p_action: plan.action,
      p_days: plan.action === 'add_days' ? plan.days : undefined,
    });
    if (error) throw error;
  },

  async setFlags(
    userId: string,
    flags: {
      isAdmin?: boolean;
      canUpload?: boolean;
      accountStatus?: AccountStatus;
      reason?: string;
    },
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_set_user_flags', {
      p_user_id: userId,
      p_is_admin: flags.isAdmin,
      p_can_upload: flags.canUpload,
      p_account_status: flags.accountStatus,
      p_reason: flags.reason,
    });
    if (error) throw error;
  },

  /** Who may buy Premium. Says nothing about free features or purchases already made. */
  async listByApproval(status: ApprovalStatus): Promise<ApprovalRow[]> {
    const { data, error } = await supabase.rpc('admin_list_user_approvals', { p_status: status });
    if (error) throw error;
    return data ?? [];
  },

  async setApproval(
    userId: string,
    status: Exclude<ApprovalStatus, 'pending'>,
    note?: string,
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_set_user_approval', {
      p_user_id: userId,
      p_status: status,
      p_note: note,
    });
    if (error) throw error;
  },

  async listSubscribers(
    cohort: SubscriberCohort,
    query = '',
    limit = 200,
  ): Promise<SubscriberRow[]> {
    const { data, error } = await supabase.rpc('admin_list_subscribers', {
      p_cohort: cohort,
      p_query: query.trim() || undefined,
      p_limit: limit,
    });
    if (error) throw error;
    return data ?? [];
  },

  async subscriberCounts(): Promise<SubscriberCounts | null> {
    const { data, error } = await supabase.rpc('admin_subscriber_counts');
    if (error) throw error;
    return data?.[0] ?? null;
  },

  async listGrants(userId: string): Promise<UserGrant[]> {
    const { data, error } = await supabase.rpc('admin_get_user_grants', { p_user_id: userId });
    if (error) throw error;
    return data ?? [];
  },

  /** Sends an in-app notification to everyone in the audience. Returns how many received it. */
  async broadcast(title: string, body: string, audience: BroadcastAudience): Promise<number> {
    const { data, error } = await supabase.rpc('admin_broadcast', {
      p_title: title,
      p_body: body,
      p_audience: audience,
    });
    if (error) throw error;
    return data ?? 0;
  },
};
