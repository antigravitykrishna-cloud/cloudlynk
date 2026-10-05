import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '@/lib/config';

const GEO_CACHE_KEY = 'cloudlynk_geo_check';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type GeoState = {
  isBlocked: boolean;
  country: string | null;
  loading: boolean;
};

/**
 * Country block check through our Cloudflare Worker (cloudflare/geo-check-worker), which reads the
 * admin-set blocklist from app_settings. Cloudflare sees the IP itself, so no IP goes to a third
 * party. Off unless GEO_CHECK_WORKER_URL is set.
 */
export function useGeoCheck(): GeoState {
  const [state, setState] = useState<GeoState>({ isBlocked: false, country: null, loading: true });

  useEffect(() => {
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(GEO_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.ts < CACHE_TTL_MS) {
            setState({ isBlocked: parsed.blocked, country: parsed.country, loading: false });
            return;
          }
        }

        if (!config.geoCheckWorkerUrl) {
          // Not deployed/configured yet — fail open rather than block everyone.
          setState({ isBlocked: false, country: null, loading: false });
          return;
        }

        const res = await fetch(config.geoCheckWorkerUrl);
        if (!res.ok) throw new Error('geo-check unavailable');
        const { country, blocked } = (await res.json()) as {
          country: string | null;
          blocked: boolean;
        };

        await AsyncStorage.setItem(
          GEO_CACHE_KEY,
          JSON.stringify({
            blocked: !!blocked,
            country: country ?? null,
            ts: Date.now(),
          }),
        );

        setState({ isBlocked: !!blocked, country: country ?? null, loading: false });
      } catch {
        // Fail open — a Worker outage or network blip must never lock every
        // user out of the app.
        setState({ isBlocked: false, country: null, loading: false });
      }
    })();
  }, []);

  return state;
}
