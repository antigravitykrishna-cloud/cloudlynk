import { supabase } from '@/lib/supabase';
import type { RpcRow } from '@/lib/rpcTypes';

export type AdminPayment = RpcRow<'admin_list_payments'>;
export type PaymentStatus = 'created' | 'paid' | 'failed';
export type AdminPlan = RpcRow<'admin_list_plans'>;

/** Gateway payments and the plans on sale. */
export const adminBillingApi = {
  async listPayments(status: PaymentStatus | null, limit = 200): Promise<AdminPayment[]> {
    const { data, error } = await supabase.rpc('admin_list_payments', {
      p_status: status ?? undefined,
      p_limit: limit,
    });
    if (error) throw error;
    return data ?? [];
  },

  async listPlans(): Promise<AdminPlan[]> {
    const { data, error } = await supabase.rpc('admin_list_plans');
    if (error) throw error;
    return data ?? [];
  },

  /** Name, description, price, length and whether it is on sale. Marking one popular unmarks the rest. */
  async updatePlan(plan: AdminPlan): Promise<void> {
    const { error } = await supabase.rpc('admin_update_plan', {
      p_code: plan.code,
      p_name: plan.name,
      p_description: plan.description,
      p_price_inr: plan.price_inr,
      p_duration_days: plan.duration_days,
      p_is_popular: plan.is_popular,
      p_is_active: plan.is_active,
    });
    if (error) throw error;
  },
};
