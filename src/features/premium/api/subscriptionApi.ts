import { supabase } from '@/lib/supabase';

/**
 * The signed-in person's plan, plus their most recent manual payment request (the older
 * screenshot-and-review flow). The request fields are null when there has never been one.
 */
export interface SubscriptionStatus {
  plan_status: string | null;
  plan_expires_at: string | null;
  plan_started_at: string | null;
  latest_request_id: string | null;
  latest_request_plan_code: string | null;
  latest_request_amount_inr: number | null;
  latest_request_status: string | null;
  latest_request_rejection_reason: string | null;
  latest_request_created_at: string | null;
  latest_request_reviewed_at: string | null;
}

export const subscriptionApi = {
  async getMine(): Promise<SubscriptionStatus | null> {
    const { data, error } = await supabase.rpc('get_my_subscription_status');
    if (error) throw error;
    return data?.[0] ?? null;
  },
};
