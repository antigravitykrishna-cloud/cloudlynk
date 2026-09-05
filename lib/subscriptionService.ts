import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  duration_days: number;
  price_inr: number;
  iap_product_id: string | null;
  is_popular: boolean;
  sort_order: number;
  is_active: boolean;
}

/** Fetches active subscription plans from the database */
export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SubscriptionPlan[];
    },
    staleTime: 1000 * 60 * 30,
  });
}
