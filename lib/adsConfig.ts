import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

/**
 * Runtime ad configuration, stored in `app_settings` (public.app_settings,
 * admin-write RLS added in v49). This is what lets a client "turn in an API
 * key" from an admin screen instead of a developer editing app.json.
 *
 * IMPORTANT ASYMMETRY — read before wiring an admin UI to this:
 *   - `bannerId` / `interstitialId` / `rewardedId` (AdMob AD UNIT IDs) are
 *     fully dynamic. Saving a new one here takes effect for every user on
 *     their next app open, no rebuild.
 *   - `appId` (the AdMob APPLICATION ID, format `ca-app-pub-XXXX~YYYY`) is
 *     stored here too so an admin screen can show/collect it, but it is
 *     informational only — Google's SDK reads the App ID from native config
 *     (AndroidManifest.xml's `com.google.android.gms.ads.APPLICATION_ID`
 *     meta-data, generated from app.json's `react-native-google-mobile-ads`
 *     plugin config) at process start, before any JS runs. Changing it here
 *     does NOT change what the native SDK uses.
 *   - Ad unit IDs only work when they belong to the SAME AdMob App ID that's
 *     baked into the native build. Pasting a client's real ad unit IDs while
 *     the app still ships Google's public sample App ID will fail to serve
 *     ads (App ID / ad unit mismatch) — going live for real always requires
 *     one `app.json` edit + `npx expo prebuild --platform android` + rebuild
 *     to set the real App ID first. After that one rebuild, ad unit ID
 *     changes are runtime-only forever.
 */
export interface AdConfig {
  enabled: boolean;
  appId: string | null;
  bannerId: string | null;
  interstitialId: string | null;
  rewardedId: string | null;
}

const SETTING_KEYS = ['ads_enabled', 'admob_app_id', 'admob_banner_id', 'admob_interstitial_id', 'admob_rewarded_id'];

function parseConfig(rows: { key: string; value: unknown }[]): AdConfig {
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const asString = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    enabled: map.ads_enabled === true || map.ads_enabled === 'true',
    appId: asString(map.admob_app_id),
    bannerId: asString(map.admob_banner_id),
    interstitialId: asString(map.admob_interstitial_id),
    rewardedId: asString(map.admob_rewarded_id),
  };
}

let cached: { config: AdConfig; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** For imperative call sites (showInterstitialAd/showRewardedAd) that can't use a hook. */
export async function getAdConfig(): Promise<AdConfig> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.config;
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', SETTING_KEYS);
  if (error) {
    return cached?.config ?? { enabled: false, appId: null, bannerId: null, interstitialId: null, rewardedId: null };
  }
  const config = parseConfig(data ?? []);
  cached = { config, fetchedAt: Date.now() };
  return config;
}

/** For components — e.g. `const { data: adConfig } = useAdConfig()`. */
export function useAdConfig() {
  return useQuery({
    queryKey: ['ad-config'],
    queryFn: getAdConfig,
    staleTime: CACHE_TTL_MS,
  });
}

/**
 * Admin-only. RLS on `app_settings` independently re-verifies `is_admin` —
 * this will fail for a non-admin caller regardless of what the client shows.
 */
export async function updateAdConfig(partial: Partial<{
  enabled: boolean; appId: string; bannerId: string; interstitialId: string; rewardedId: string;
}>): Promise<void> {
  const rows: { key: string; value: unknown }[] = [];
  if (partial.enabled !== undefined) rows.push({ key: 'ads_enabled', value: partial.enabled });
  if (partial.appId !== undefined) rows.push({ key: 'admob_app_id', value: partial.appId || null });
  if (partial.bannerId !== undefined) rows.push({ key: 'admob_banner_id', value: partial.bannerId || null });
  if (partial.interstitialId !== undefined) rows.push({ key: 'admob_interstitial_id', value: partial.interstitialId || null });
  if (partial.rewardedId !== undefined) rows.push({ key: 'admob_rewarded_id', value: partial.rewardedId || null });
  if (!rows.length) return;

  const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
  if (error) throw error;
  cached = null; // force a refetch on the next getAdConfig()/useAdConfig()
}
