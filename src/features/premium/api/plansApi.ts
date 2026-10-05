import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type SubscriptionPlan = Tables<'subscription_plans'>;

export const plansApi = {
  /** The plans on sale, in display order. */
  async listActive(): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
};
