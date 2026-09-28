-- v92 (2026-09-29): guests save their account BEFORE they pay, and are
-- approved only after that.
--
-- Rules from the client: a guest sees previews only and cannot join. Letting
-- a guest pay then collided with both -- they had a plan they could not use,
-- and a plan on a guest account is lost on uninstall. So a guest is asked to
-- save the account (Google or email) first; only a saved account can be
-- approved, and only a saved account can create a payment order.
--
-- Video: every Cloudflare Stream video is now requireSignedURLs=true, free
-- ones too (stream-set-access / stream-playback-token v92, and a one-shot
-- lock of all 47 existing videos). Nothing to do in SQL for that.

-- 1. Guests cannot be approved; they are not in the approval queue.
CREATE OR REPLACE FUNCTION public.admin_set_user_approval(p_user_id uuid, p_status text, p_note text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid approval status: %', p_status USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Profile % not found', p_user_id;
  END IF;

  IF p_status = 'approved' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND is_guest) THEN
    RAISE EXCEPTION 'This is a guest account. It can be approved once the person saves it with Google or email.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.trusted_update', 'true', true);

  UPDATE public.profiles
  SET approval_status = p_status,
      approval_reviewed_by = auth.uid(),
      approval_reviewed_at = now(),
      approval_note = p_note
  WHERE id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_user_approvals(p_status text DEFAULT 'pending'::text, p_limit integer DEFAULT 200)
RETURNS TABLE(id uuid, email text, full_name text, username text, created_at timestamp with time zone, approval_status text, approval_note text, approval_reviewed_at timestamp with time zone, device_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid approval status: %', p_status USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.username, p.created_at,
         p.approval_status, p.approval_note, p.approval_reviewed_at,
         (SELECT count(*)::integer FROM public.user_devices d WHERE d.user_id = p.id)
  FROM public.profiles p
  WHERE p.approval_status = p_status
    AND NOT p.is_guest
  ORDER BY
    CASE WHEN p_status = 'pending' THEN p.created_at END ASC,
    CASE WHEN p_status <> 'pending' THEN p.approval_reviewed_at END DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 200), 500));
END;
$function$;

-- 2. No payment order for a guest. The payments function inserts with the
--    service role (RLS does not apply), so this is a trigger: it holds for
--    every writer. An order is created before any money moves, so refusing
--    here can never strand a payment.
CREATE OR REPLACE FUNCTION public.no_guest_payment_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND is_guest) THEN
    RAISE EXCEPTION 'Save your account with Google or email before subscribing.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.no_guest_payment_orders() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS no_guest_payment_orders ON public.payment_orders;
CREATE TRIGGER no_guest_payment_orders
  BEFORE INSERT ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.no_guest_payment_orders();
