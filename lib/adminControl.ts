import { supabase } from './supabase';

// The admin powers added in v82. Every RPC re-checks is_active_admin() on the
// server and writes admin_audit_log -- the app-side isAdmin checks are only
// there to keep the screens tidy.

export interface AdminUserSummary {
  id: string;
  email: string;
  full_name: string | null;
  plan_status: string | null;
  plan_expires_at: string | null;
  approval_status: string | null;
  account_status: string | null;
  created_at: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  is_admin: boolean;
  can_upload_content: boolean;
  plan_started_at: string | null;
  plan_active: boolean;
  channels_owned: number;
  channels_joined: number;
  posts: number;
  payments_paid: number;
  last_payment_at: string | null;
}

export interface AdminPayment {
  id: string;
  created_at: string;
  paid_at: string | null;
  status: 'created' | 'paid' | 'failed';
  method: 'upi' | 'razorpay' | 'sabpaisa';
  provider: string;
  plan_code: string;
  amount_inr: number;
  email: string | null;
  full_name: string | null;
  provider_payment_id: string | null;
  google_reported: boolean;
  google_report_needed: boolean;
  failure_reason: string | null;
}

export interface AdminPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  duration_days: number;
  price_inr: number;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
}

export type PlanAction =
  | { action: 'add_days'; days: number }
  | { action: 'lifetime' }
  | { action: 'revoke' };

function unwrap<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw new Error(res.error.message ?? 'Request failed');
  return res.data as T;
}

export const AdminControl = {
  async searchUsers(query: string, limit = 50): Promise<AdminUserSummary[]> {
    return unwrap(await supabase.rpc('admin_search_users', {
      p_query: query.trim() || null, p_limit: limit,
    })) ?? [];
  },

  async getUser(id: string): Promise<AdminUserDetail> {
    return unwrap(await supabase.rpc('admin_get_user', { p_user_id: id }));
  },

  async setPlan(id: string, a: PlanAction) {
    return unwrap(await supabase.rpc('admin_set_user_plan', {
      p_user_id: id,
      p_action: a.action,
      p_days: a.action === 'add_days' ? a.days : null,
      p_expires_at: null,
    }));
  },

  async setFlags(id: string, flags: { isAdmin?: boolean; canUpload?: boolean; accountStatus?: 'active' | 'suspended' | 'banned'; reason?: string }) {
    return unwrap(await supabase.rpc('admin_set_user_flags', {
      p_user_id: id,
      p_is_admin: flags.isAdmin ?? null,
      p_can_upload: flags.canUpload ?? null,
      p_account_status: flags.accountStatus ?? null,
      p_reason: flags.reason ?? null,
    }));
  },

  async setApproval(id: string, status: 'approved' | 'rejected', note?: string) {
    return unwrap(await supabase.rpc('admin_set_user_approval', {
      p_user_id: id, p_status: status, p_note: note ?? null,
    }));
  },

  async listPayments(status: 'paid' | 'created' | 'failed' | null, limit = 200): Promise<AdminPayment[]> {
    return unwrap(await supabase.rpc('admin_list_payments', { p_status: status, p_limit: limit })) ?? [];
  },

  async listPlans(): Promise<AdminPlan[]> {
    return unwrap(await supabase.rpc('admin_list_plans')) ?? [];
  },

  async updatePlan(p: AdminPlan) {
    return unwrap(await supabase.rpc('admin_update_plan', {
      p_code: p.code, p_name: p.name, p_description: p.description,
      p_price_inr: p.price_inr, p_duration_days: p.duration_days,
      p_is_popular: p.is_popular, p_is_active: p.is_active,
    }));
  },

  async updateChannel(c: { id: string; name: string; description: string | null; category: string | null; is_public: boolean; is_official: boolean }) {
    return unwrap(await supabase.rpc('admin_update_channel', {
      p_channel_id: c.id, p_name: c.name, p_description: c.description ?? '',
      p_category: c.category ?? '', p_is_public: c.is_public, p_is_official: c.is_official,
    }));
  },

  async setChannelStatus(id: string, status: 'active' | 'suspended', reason?: string) {
    return unwrap(await supabase.rpc('admin_set_channel_status', {
      p_channel_id: id, p_status: status, p_reason: reason ?? null,
    }));
  },

  async broadcast(title: string, body: string, audience: 'all' | 'premium' | 'free'): Promise<number> {
    return unwrap(await supabase.rpc('admin_broadcast', { p_title: title, p_body: body, p_audience: audience })) ?? 0;
  },
};
