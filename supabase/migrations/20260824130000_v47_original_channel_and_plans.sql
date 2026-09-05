-- Migration v47: Original channel fields + original pricing ladder (24 Aug 2026)
--
-- Context: Play Store compliance / de-duplication pass. `app/create-content.tsx`
-- collects a "Channel Link" and "Channel Category" in the form but the old
-- `ChannelService.createChannel` silently dropped both — this migration adds
-- the columns so that bug fix (made alongside this migration in
-- `lib/channels.ts`) has somewhere to write.
--
-- It also replaces the subscription tier codes/names/prices, which were a
-- near-exact copy of a competitor app's own plan ladder (same five-tier
-- "metal" naming — Trial/Silver/Gold/Platinum/Diamond — landing on several
-- identical price points: 259/599/899). New codes are original; the old
-- 'trial'/'silver'/'gold'/'platinum'/'diamond' rows are deactivated (not
-- deleted, so any historical subscription_requests.plan_code FK-by-convention
-- references still resolve).

-- ═══════════════════════════════════════════════════════════════
-- 1. channels: link + category
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS category text;

-- ═══════════════════════════════════════════════════════════════
-- 2. subscription_plans: original tier ladder
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_code_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_code_check
  CHECK (code IN ('trial', 'silver', 'gold', 'platinum', 'diamond', 'starter', 'basic', 'pro', 'pro_plus', 'annual'));

-- Retire the old copied ladder rather than deleting it (keeps historical
-- subscription_requests.plan_code values resolvable for reporting).
UPDATE public.subscription_plans SET is_active = false, updated_at = now()
  WHERE code IN ('trial', 'silver', 'gold', 'platinum', 'diamond');

INSERT INTO public.subscription_plans (code, name, description, duration_days, price_inr, is_popular, sort_order) VALUES
  ('starter',   'Starter',   '3-day trial',            3,   49,   false, 1),
  ('basic',     'Basic',     'Weekly access',          7,   99,   false, 2),
  ('pro',       'Pro',       'Our most popular plan',  30,  199,  true,  3),
  ('pro_plus',  'Pro+',      'Quarterly savings',      90,  449,  false, 4),
  ('annual',    'Annual',    'Best value, billed once', 365, 1499, false, 5)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  duration_days = excluded.duration_days,
  price_inr = excluded.price_inr,
  is_popular = excluded.is_popular,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
