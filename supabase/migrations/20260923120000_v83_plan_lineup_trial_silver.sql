-- v83: the client's plan lineup.
--
--   Trial     3 days    ₹99    (new)
--   Silver    7 days    ₹149   (was ₹199)
--   Gold      1 month   ₹259
--   Platinum  6 months  ₹599
--   Diamond   1 year    ₹999
--
-- 'trial' is already allowed by subscription_plans_code_check. Its Google
-- Play base plan id is 'trial-3d' (lib/services/iap.ts). Google Play cannot
-- auto-renew every 3 days, so in Play Console that base plan has to be a
-- PREPAID (non-renewing) plan; the other four can auto-renew.

INSERT INTO public.subscription_plans
  (code, name, description, duration_days, price_inr, iap_product_id, is_popular, sort_order, is_active)
VALUES
  ('trial', 'Trial', '3-day access', 3, 99, 'cloudlynk_premium', false, 0, true)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      duration_days = EXCLUDED.duration_days, price_inr = EXCLUDED.price_inr,
      sort_order = EXCLUDED.sort_order, is_active = true, updated_at = now();

UPDATE public.subscription_plans
   SET price_inr = 149, updated_at = now()
 WHERE code = 'silver-7d';
