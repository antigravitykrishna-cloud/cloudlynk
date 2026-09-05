-- v50: Google Play purchase tracking + entitlement source of truth.
--
-- Why this exists: `verify-play-receipt` (called at purchase time) previously
-- updated `profiles.plan_status` directly with no record of *which* purchase
-- token granted it. That meant:
--   1. There was no way to look up "which user does this purchaseToken
--      belong to" — which Real-time Developer Notifications (RTDN) require,
--      since Google's renewal/cancellation/refund webhooks only carry the
--      purchase token, not a user id.
--   2. No record of whether a purchase had been acknowledged yet — Google
--      auto-refunds any subscription purchase left unacknowledged for 3 days
--      (see supabase/functions/_shared/play-billing.ts).
-- This table is the fix: every verified purchase is recorded here, and it is
-- the join key `play-rtdn-webhook` uses to find the affected user.

CREATE TABLE IF NOT EXISTS public.iap_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purchase_token text NOT NULL UNIQUE,
  product_id text NOT NULL,
  plan_code text NOT NULL,
  package_name text NOT NULL,
  platform text NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'on_hold', 'paused', 'revoked', 'pending')),
  expires_at timestamptz,
  acknowledged boolean NOT NULL DEFAULT false,
  last_notification_type text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS iap_purchases_user_id_idx ON public.iap_purchases(user_id);
-- purchase_token already has a UNIQUE index from the constraint above, which
-- is exactly the lookup play-rtdn-webhook needs.

ALTER TABLE public.iap_purchases ENABLE ROW LEVEL SECURITY;

-- Users can see their own purchase history (e.g. a future "billing history"
-- screen) but never write to it directly — only the service-role Edge
-- Functions (verify-play-receipt, play-rtdn-webhook) write here, since the
-- data must reflect what Google actually says, not what a client claims.
DROP POLICY IF EXISTS "Users can view own purchases" ON public.iap_purchases;
CREATE POLICY "Users can view own purchases"
  ON public.iap_purchases FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS iap_purchases_set_updated_at ON public.iap_purchases;
CREATE TRIGGER iap_purchases_set_updated_at
  BEFORE UPDATE ON public.iap_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Documentation-only: record which Play product ID each plan maps to, so
-- an admin looking at this table sees the real mapping instead of having to
-- read lib/services/iap.ts. The app itself still reads the hardcoded list in
-- lib/services/iap.ts at purchase time — keep both in sync if you rename a
-- Play Console product.
UPDATE public.subscription_plans SET iap_product_id = CASE code
  WHEN 'starter'  THEN 'cloudlynk_starter_3d'
  WHEN 'basic'    THEN 'cloudlynk_basic_7d'
  WHEN 'pro'      THEN 'cloudlynk_pro_30d'
  WHEN 'pro_plus' THEN 'cloudlynk_pro_plus_90d'
  WHEN 'annual'   THEN 'cloudlynk_annual_365d'
  ELSE iap_product_id
END
WHERE code IN ('starter', 'basic', 'pro', 'pro_plus', 'annual');
