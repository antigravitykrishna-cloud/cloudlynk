-- v53: Google Play Billing — move from 5 separate subscription products to
-- ONE product (`cloudlynk_premium`) with 4 auto-renewing base plans.
--
-- Old model: cloudlynk_starter_3d / _basic_7d / _pro_30d / _pro_plus_90d /
-- _annual_365d, one Play Console product per plan, plan resolved from
-- productId. New model: every plan is a base plan under `cloudlynk_premium`,
-- distinguished by basePlanId. The server now derives the granted plan from
-- Google's own basePlanId (see verify-play-receipt/index.ts) rather than
-- trusting a client-supplied plan code — checking productId alone no longer
-- proves which plan a token is for once they all share one product.
--
-- Confirmed by the owner: 4 plans — Silver ₹199/7d, Gold ₹259/1m,
-- Platinum ₹599/6m, Diamond ₹999/1y — all AUTO-RENEWING base plans. This
-- matches the auto-renewing-subscription language already shipped in
-- supabase/functions/legal-pages/terms.ts and refund.ts (no legal changes).
--
-- This migration does NOT touch how a purchase is verified beyond adding the
-- base_plan_id column; verify-play-receipt / play-rtdn-webhook code changes
-- ship alongside it. plan_status semantics are unchanged (v52).

-- ═══════════════════════════════════════════════════════════════
-- 1. iap_purchases: record the base plan directly, not only in raw_response
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.iap_purchases
  ADD COLUMN IF NOT EXISTS base_plan_id text;

-- ═══════════════════════════════════════════════════════════════
-- 2. subscription_plans: allow the new codes, retire the old rows
-- ═══════════════════════════════════════════════════════════════
--
-- The `code` here must match DEFAULT_PLANS[].code in lib/services/iap.ts
-- exactly — app/premium.tsx passes subscription_plans.code straight into
-- getIapService().purchasePlan(). Old rows are deactivated, not deleted, so
-- historical iap_purchases.plan_code values still resolve for reporting.

ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_code_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_code_check
  CHECK (code IN (
    -- current (v53)
    'silver-7d', 'gold-1m', 'platinum-6m', 'diamond-1y',
    -- retired, kept for historical plan_code resolution
    'trial', 'silver', 'gold', 'platinum', 'diamond',
    'starter', 'basic', 'pro', 'pro_plus', 'annual'
  ));

UPDATE public.subscription_plans
  SET is_active = false, updated_at = now()
  WHERE code IN ('trial', 'silver', 'gold', 'platinum', 'diamond',
                 'starter', 'basic', 'pro', 'pro_plus', 'annual');

INSERT INTO public.subscription_plans
  (code, name, description, duration_days, price_inr, iap_product_id, is_popular, sort_order, is_active)
VALUES
  ('silver-7d',   'Silver',   '7-day access',   7,   199, 'cloudlynk_premium', false, 1, true),
  ('gold-1m',     'Gold',     '1-month access', 30,  259, 'cloudlynk_premium', true,  2, true),
  ('platinum-6m', 'Platinum', '6-month access', 180, 599, 'cloudlynk_premium', false, 3, true),
  ('diamond-1y',  'Diamond',  '1-year access',  365, 999, 'cloudlynk_premium', false, 4, true)
ON CONFLICT (code) DO UPDATE SET
  name           = EXCLUDED.name,
  description    = EXCLUDED.description,
  duration_days  = EXCLUDED.duration_days,
  price_inr      = EXCLUDED.price_inr,
  iap_product_id = EXCLUDED.iap_product_id,
  is_popular     = EXCLUDED.is_popular,
  sort_order     = EXCLUDED.sort_order,
  is_active      = true,
  updated_at     = now();

NOTIFY pgrst, 'reload schema';
