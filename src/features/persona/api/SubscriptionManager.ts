/**
 * Subscription Manager
 * Handles subscription plans, expiry, renewal, and notifications
 * Integrates with payment systems and auto-expiry checks
 */

import { supabase } from '@/lib/supabase';
import { Colors } from '@/theme';
import * as SecureStore from 'expo-secure-store';
import { NotificationManager } from '@/features/persona/api/NotificationManager';

export type SubscriptionPlan = 'trial' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface SubscriptionInfo {
  plan: SubscriptionPlan;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  amountPaid: number;
  currency: string;
  paymentMethod?: string;
}

export interface PlanDetails {
  plan: SubscriptionPlan;
  displayName: string;
  duration: number; // days
  priceINR: number;
  features: string[];
  color: string;
}

export class SubscriptionManager {
  private static readonly SUBSCRIPTION_KEY = 'subscription_info';

  // Plan definitions - customize for your app
  static readonly PLANS: Record<SubscriptionPlan, PlanDetails> = {
    trial: {
      plan: 'trial',
      displayName: 'Trial',
      duration: 3,
      priceINR: 99,
      features: ['Limited content', 'HD streaming'],
      color: Colors.success,
    },
    silver: {
      plan: 'silver',
      displayName: 'Silver',
      duration: 7,
      priceINR: 149,
      features: ['All content', 'HD streaming', 'Offline downloads'],
      color: Colors.textSecondary,
    },
    gold: {
      plan: 'gold',
      displayName: 'Gold',
      duration: 30,
      priceINR: 259,
      features: ['All content', '4K streaming', 'Offline downloads', 'Ad-free'],
      color: Colors.gold,
    },
    platinum: {
      plan: 'platinum',
      displayName: 'Platinum',
      duration: 180,
      priceINR: 599,
      features: ['All content', '4K streaming', 'Offline downloads', 'Ad-free', 'Early access'],
      color: Colors.text,
    },
    diamond: {
      plan: 'diamond',
      displayName: 'Diamond',
      duration: 365,
      priceINR: 999,
      features: [
        'All content',
        '4K streaming',
        'Offline downloads',
        'Ad-free',
        'Early access',
        'Premium support',
      ],
      color: Colors.pastelPink,
    },
  };

  /**
   * Subscribe to a plan
   * In production, integrate with Razorpay or your payment provider
   */
  static async subscribe(
    userId: string,
    plan: SubscriptionPlan,
    paymentMethod: string,
  ): Promise<SubscriptionInfo> {
    try {
      const planDetails = this.PLANS[plan];
      const now = new Date();
      const endDate = new Date(now.getTime() + planDetails.duration * 24 * 60 * 60 * 1000);

      const subscription: SubscriptionInfo = {
        plan,
        status: 'active',
        startDate: now.toISOString(),
        endDate: endDate.toISOString(),
        autoRenew: true,
        amountPaid: planDetails.priceINR,
        currency: 'INR',
        paymentMethod,
      };

      // Save to Supabase (if subscriptions table exists)
      try {
        const { error } = await supabase.from('subscriptions').insert({
          user_id: userId,
          plan_type: plan,
          status: 'active',
          start_date: now.toISOString(),
          end_date: endDate.toISOString(),
          amount_paid: planDetails.priceINR,
          currency: 'INR',
        });

        if (error) {
          console.warn('Failed to save subscription to database:', error);
          // Continue anyway - subscription is still valid locally
        }
      } catch (error) {
        console.warn('Subscriptions table not available yet, using local storage only:', error);
      }

      // Cache locally
      await SecureStore.setItemAsync(this.SUBSCRIPTION_KEY, JSON.stringify(subscription));

      // Schedule expiry notifications
      await this.scheduleExpiryNotifications(userId, endDate);

      return subscription;
    } catch (error) {
      console.error('Subscription failed:', error);
      throw new Error('Failed to subscribe');
    }
  }

  /**
   * Check current subscription status
   */
  static async checkSubscription(userId: string): Promise<SubscriptionInfo | null> {
    try {
      // Try cached first
      const cached = await SecureStore.getItemAsync(this.SUBSCRIPTION_KEY);
      if (cached) {
        const subscription = JSON.parse(cached) as SubscriptionInfo;

        // Check if expired
        if (new Date(subscription.endDate) < new Date()) {
          // Refresh from server
          return await this._fetchFromServer(userId);
        }

        return subscription;
      }

      return await this._fetchFromServer(userId);
    } catch (error) {
      console.error('Check subscription failed:', error);
      return null;
    }
  }

  /**
   * Renew subscription
   */
  static async renew(userId: string, plan: SubscriptionPlan): Promise<SubscriptionInfo> {
    try {
      const current = await this.checkSubscription(userId);
      if (!current) throw new Error('No active subscription to renew');

      const planDetails = this.PLANS[plan];
      const now = new Date();
      const endDate = new Date(now.getTime() + planDetails.duration * 24 * 60 * 60 * 1000);

      const renewed: SubscriptionInfo = {
        plan,
        status: 'active',
        startDate: now.toISOString(),
        endDate: endDate.toISOString(),
        autoRenew: true,
        amountPaid: planDetails.priceINR,
        currency: 'INR',
      };

      // Update in Supabase (if subscriptions table exists)
      try {
        const { error } = await supabase
          .from('subscriptions')
          .update({
            plan_type: plan,
            status: 'active',
            start_date: now.toISOString(),
            end_date: endDate.toISOString(),
          })
          .eq('user_id', userId);

        if (error) console.warn('Failed to update subscription:', error);
      } catch (error) {
        console.warn('Subscriptions table not available:', error);
      }

      await SecureStore.setItemAsync(this.SUBSCRIPTION_KEY, JSON.stringify(renewed));
      await this.scheduleExpiryNotifications(userId, endDate);

      return renewed;
    } catch (error) {
      console.error('Renewal failed:', error);
      throw new Error('Failed to renew subscription');
    }
  }

  /**
   * Cancel subscription
   */
  static async cancel(userId: string): Promise<void> {
    try {
      try {
        const { error } = await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('user_id', userId);

        if (error) console.warn('Failed to mark subscription as cancelled:', error);
      } catch (error) {
        console.warn('Subscriptions table not available:', error);
      }

      await SecureStore.deleteItemAsync(this.SUBSCRIPTION_KEY);
    } catch (error) {
      console.error('Cancel failed:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  /**
   * Get subscription expiry date
   */
  static async getExpiryDate(userId: string): Promise<Date | null> {
    const subscription = await this.checkSubscription(userId);
    return subscription ? new Date(subscription.endDate) : null;
  }

  /**
   * Check if subscription is active
   */
  static async isActive(userId: string): Promise<boolean> {
    const subscription = await this.checkSubscription(userId);
    if (!subscription) return false;

    return subscription.status === 'active' && new Date(subscription.endDate) > new Date();
  }

  /**
   * Get days until expiry
   */
  static async getDaysUntilExpiry(userId: string): Promise<number | null> {
    const expiryDate = await this.getExpiryDate(userId);
    if (!expiryDate) return null;

    const now = new Date();
    const diff = expiryDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Schedule expiry notifications
   * Sends notifications at 3 days, 1 day, and on expiry
   */
  private static async scheduleExpiryNotifications(
    userId: string,
    expiryDate: Date,
  ): Promise<void> {
    const now = new Date();
    const msUntilExpiry = expiryDate.getTime() - now.getTime();

    // 3 days before
    const threeDay = msUntilExpiry - 3 * 24 * 60 * 60 * 1000;
    if (threeDay > 0) {
      setTimeout(() => {
        NotificationManager.sendNotification({
          type: 'subscription_expiry',
          title: 'Subscription expiring soon',
          body: 'Your subscription expires in 3 days',
          data: { userId, action: 'renew' },
        });
      }, threeDay);
    }

    // 1 day before
    const oneDay = msUntilExpiry - 1 * 24 * 60 * 60 * 1000;
    if (oneDay > 0) {
      setTimeout(() => {
        NotificationManager.sendNotification({
          type: 'subscription_expiry',
          title: 'Subscription expires tomorrow',
          body: 'Renew now to keep your access',
          data: { userId, action: 'renew' },
        });
      }, oneDay);
    }

    // On expiry
    setTimeout(() => {
      NotificationManager.sendNotification({
        type: 'subscription_expiry',
        title: 'Subscription expired',
        body: 'Your subscription has expired. Browse preview content or renew.',
        data: { userId, action: 'upgrade' },
      });
    }, msUntilExpiry);
  }

  /**
   * Fetch subscription from server
   */
  private static async _fetchFromServer(userId: string): Promise<SubscriptionInfo | null> {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('Subscriptions table not available:', error);
        return null;
      }
      if (!data) return null;

      const subscription: SubscriptionInfo = {
        plan: (data.plan_type as SubscriptionPlan) || 'trial',
        status: (data.status as 'active' | 'expired' | 'cancelled' | 'pending') || 'expired',
        startDate: data.start_date || new Date().toISOString(),
        endDate: data.end_date || new Date().toISOString(),
        autoRenew: data.auto_renew !== false,
        amountPaid: data.amount_paid || 0,
        currency: data.currency || 'INR',
        paymentMethod: data.payment_method ?? undefined,
      };

      await SecureStore.setItemAsync(this.SUBSCRIPTION_KEY, JSON.stringify(subscription));
      return subscription;
    } catch (error) {
      console.warn('Fetch subscription failed (subscriptions table may not exist yet):', error);
      return null;
    }
  }
}
