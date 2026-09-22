-- v80: payments through Razorpay (incl. UPI app-list) and Sabpaisa, alongside
-- Google Play Billing.
--
-- Why these exist, and the rules they enforce:
--
--  * Play policy. A Play-distributed app may only take payment for digital
--    content outside Google Play Billing under Google's user choice billing
--    program (India). Under it, every alternative-billing sale has to be
--    reported to Google within 24 hours with the externalTransactionToken the
--    device received. payment_orders keeps that token and whether the report
--    went through, so an unreported sale is visible, not silent.
--
--  * Trust. The phone never decides that a payment succeeded. A UPI app or a
--    gateway page returning to the app proves nothing -- that result can be
--    forged. Only the payments edge function, after confirming with the
--    gateway's own server (signature + status API, or webhook), calls
--    grant_gateway_payment. The table is therefore read-only to clients and
--    the grant function is executable by service_role only.
--
--  * Idempotence. Razorpay retries webhooks, the app verifies on return, and
--    the two race. grant_gateway_payment locks the order row and returns the
--    existing result for an order that is already paid, so one payment can
--    never extend a plan twice.
--
--  * Account deletion. Payment records are financial records and outlive the
--    account; user_id is ON DELETE SET NULL, the same rule v76 applied to
--    every other attribution FK so that deletion is never blocked.

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_code                   text NOT NULL,
  amount_inr                  integer NOT NULL CHECK (amount_inr > 0),
  duration_days               integer NOT NULL CHECK (duration_days > 0),
  -- What the person tapped ('upi' is Razorpay's UPI app-list checkout) and
  -- which gateway actually processes it.
  method                      text NOT NULL CHECK (method IN ('upi', 'razorpay', 'sabpaisa')),
  provider                    text NOT NULL CHECK (provider IN ('razorpay', 'sabpaisa')),
  status                      text NOT NULL DEFAULT 'created'
                                CHECK (status IN ('created', 'paid', 'failed')),
  provider_order_id           text UNIQUE,
  provider_payment_id         text,
  -- Google user choice billing. NULL for sales made outside that flow
  -- (sideloaded test builds only -- see lib/config.ts ALTERNATIVE_BILLING).
  external_transaction_token  text,
  google_reported_at          timestamptz,
  google_report_error         text,
  entitlement_expires_at      timestamptz,
  failure_reason              text,
  raw                         jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  paid_at                     timestamptz
);

CREATE INDEX IF NOT EXISTS payment_orders_user_idx    ON public.payment_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_status_idx  ON public.payment_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_unreported_idx
  ON public.payment_orders (paid_at)
  WHERE status = 'paid' AND external_transaction_token IS NOT NULL AND google_reported_at IS NULL;

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_orders FROM anon, authenticated;
GRANT SELECT ON public.payment_orders TO authenticated;

DROP POLICY IF EXISTS payment_orders_select_own ON public.payment_orders;
CREATE POLICY payment_orders_select_own ON public.payment_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Marks an order paid and extends the buyer's plan by the order's duration.
-- Extends from the later of now and the current expiry, so buying again
-- before a plan runs out adds time instead of discarding what is left.
-- A lifetime account is left alone (the order is still recorded as paid).
CREATE OR REPLACE FUNCTION public.grant_gateway_payment(
  p_order_id            uuid,
  p_provider_payment_id text,
  p_raw                 jsonb DEFAULT NULL
) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o          public.payment_orders%ROWTYPE;
  p          public.profiles%ROWTYPE;
  base       timestamptz;
  new_expiry timestamptz;
BEGIN
  SELECT * INTO o FROM public.payment_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown payment order %', p_order_id USING ERRCODE = 'P0002';
  END IF;

  IF o.status = 'paid' THEN
    RETURN o.entitlement_expires_at;
  END IF;

  IF o.user_id IS NULL THEN
    -- The account was deleted between paying and confirmation. Record the
    -- payment (it is still owed a refund decision) but there is no one to
    -- grant to.
    UPDATE public.payment_orders
       SET status = 'paid', paid_at = now(), provider_payment_id = p_provider_payment_id,
           raw = coalesce(p_raw, raw)
     WHERE id = o.id;
    RETURN NULL;
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = o.user_id FOR UPDATE;

  IF p.plan_status = 'lifetime' THEN
    new_expiry := NULL;
  ELSE
    base := CASE
      WHEN p.plan_status = 'active' AND p.plan_expires_at IS NOT NULL AND p.plan_expires_at > now()
        THEN p.plan_expires_at
      ELSE now()
    END;
    new_expiry := base + make_interval(days => o.duration_days);
    PERFORM public.apply_play_entitlement(o.user_id, 'active', new_expiry);
  END IF;

  UPDATE public.payment_orders
     SET status = 'paid',
         paid_at = now(),
         provider_payment_id = p_provider_payment_id,
         entitlement_expires_at = new_expiry,
         raw = coalesce(p_raw, raw)
   WHERE id = o.id;

  RETURN new_expiry;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_gateway_payment(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_gateway_payment(uuid, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.grant_gateway_payment(uuid, text, jsonb) IS
  'v80: marks a gateway order paid and extends the plan by its duration. Idempotent. service_role only -- called by the payments edge function after the gateway''s server confirmed the payment.';

-- Admin: recent payments, newest first, with the buyer's email. For the
-- Payments screen in the admin panel.
CREATE OR REPLACE FUNCTION public.admin_list_payments(
  p_status text DEFAULT NULL,
  p_limit  int  DEFAULT 100
) RETURNS TABLE (
  id                 uuid,
  created_at         timestamptz,
  paid_at            timestamptz,
  status             text,
  method             text,
  provider           text,
  plan_code          text,
  amount_inr         integer,
  email              text,
  full_name          text,
  provider_payment_id text,
  google_reported    boolean,
  google_report_needed boolean,
  failure_reason     text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT o.id, o.created_at, o.paid_at, o.status, o.method, o.provider, o.plan_code,
         o.amount_inr, pr.email, pr.full_name, o.provider_payment_id,
         o.google_reported_at IS NOT NULL,
         o.status = 'paid' AND o.external_transaction_token IS NOT NULL,
         o.failure_reason
    FROM public.payment_orders o
    LEFT JOIN public.profiles pr ON pr.id = o.user_id
   WHERE p_status IS NULL OR o.status = p_status
   ORDER BY o.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 100), 500));
END;
$$;

REVOKE ALL   ON FUNCTION public.admin_list_payments(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payments(text, int) TO authenticated;

COMMENT ON TABLE public.payment_orders IS
  'v80: Razorpay / Sabpaisa orders. Written only by the payments edge function (service_role). Buyers can read their own rows.';
