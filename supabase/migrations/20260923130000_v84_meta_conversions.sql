-- v84: report confirmed UPI / Razorpay / Sabpaisa purchases to Meta.
--
-- The client runs Meta ads for installs and subscriptions. Google Play
-- purchases reach Meta through its SDK in the app; gateway purchases are
-- confirmed on our server, often after the app has closed, so the payments
-- function reports them through Meta's Conversions API instead.
--
--   meta_device   what the app sent with the order to tie the purchase to
--                 the phone (Meta anonymous ID, advertising ID, device info).
--                 NULL when the person turned ad measurement off -- and then
--                 nothing is sent to Meta for that order.
--   meta_sent_at  set once Meta accepted the event; the event_id is the
--                 order id, so a retry can never count twice.
--   meta_error    last failure, for the admin Payments screen.

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS meta_device  jsonb,
  ADD COLUMN IF NOT EXISTS meta_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_error   text;
