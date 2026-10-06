-- Create subscriptions table for managing user subscription tiers
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('trial', 'silver', 'gold', 'platinum', 'diamond')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  auto_renew BOOLEAN DEFAULT false,
  amount_paid DECIMAL(10, 2),
  currency TEXT DEFAULT 'INR',
  payment_method TEXT CHECK (payment_method IN ('razorpay', 'google_play', 'apple_pay', 'test')),
  razorpay_subscription_id TEXT,
  razorpay_order_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_end_date ON public.subscriptions(end_date);
CREATE INDEX idx_subscriptions_created_at ON public.subscriptions(created_at);

-- Enable Row Level Security
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own subscriptions
CREATE POLICY "Users see own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert (via backend)
CREATE POLICY "Only service role inserts subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (FALSE);

-- Only service role can update
CREATE POLICY "Only service role updates subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (FALSE)
  WITH CHECK (FALSE);

-- Admins can read all subscriptions (for analytics)
CREATE POLICY "Admins can read all subscriptions"
  ON public.subscriptions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
    AND u.raw_user_meta_data->>'role' = 'admin'
  ));
