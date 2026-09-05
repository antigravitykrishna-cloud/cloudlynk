-- Migration v49: admin-configurable ads + Cloudflare-based geo-blocking (25 Aug 2026)
--
-- Two things:
--   1. `app_settings` had public SELECT (v12) but NO write policy at all — so
--      there was no self-service way for an admin to change anything short of
--      the Supabase SQL editor. This adds an admin-only INSERT/UPDATE policy
--      so a real "Ad settings" admin screen can be built against it.
--   2. Seeds the ad-config keys the new `lib/adsConfig.ts` reads
--      (ads_enabled, admob_banner_id, admob_interstitial_id, admob_rewarded_id,
--      admob_app_id — see that file's header comment for why admob_app_id is
--      informational-only and still needs one native rebuild to actually take
--      effect, unlike the ad unit IDs which are live the moment they're saved).
--
-- Geo-blocking itself (`geo_block_enabled` / `blocked_countries`, from v12)
-- didn't need a schema change — what changed is *where the country comes
-- from*: `hooks/useGeoCheck.ts` now calls a Cloudflare Worker
-- (`cloudflare/geo-check-worker/`) that reads `request.cf.country` instead of
-- sending the user's IP to the third-party ipapi.co, and that Worker reads
-- these same two `app_settings` rows so the admin screen still controls the
-- blocklist from one place.

DROP POLICY IF EXISTS "Admins can write app_settings" ON public.app_settings;
CREATE POLICY "Admins can write app_settings"
  ON public.app_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

INSERT INTO public.app_settings (key, value) VALUES
  ('ads_enabled', 'false'::jsonb),
  ('admob_app_id', 'null'::jsonb),
  ('admob_banner_id', 'null'::jsonb),
  ('admob_interstitial_id', 'null'::jsonb),
  ('admob_rewarded_id', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
