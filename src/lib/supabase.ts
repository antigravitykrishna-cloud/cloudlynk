import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

export type { Database } from '@/lib/database.types';

// ── Credentials from environment ─────────────────────────────
export const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Fail at launch with a clear message if the build has no backend credentials. EXPO_PUBLIC_* values
// are inlined at bundle time; a build that could not see them would otherwise open and silently
// fail every request. Both values are public by design (RLS is the security boundary); for EAS
// builds set them in eas.json `env`.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Cloudlynk is not configured: EXPO_PUBLIC_SUPABASE_URL / ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY were empty when this bundle was built. ' +
      'The bundler could not see them -- see DEPLOY.md 1.2.',
  );
}

// ── Where the signed-in session is kept ──────────────────────
// Native: SecureStore (Android Keystore). SecureStore rejects values over
// ~2 KB, so larger ones go to AsyncStorage under an "overflow" key.
// Web (and bundling, where there is no SecureStore): localStorage.
const SECURE_STORE_LIMIT = 2048;
const overflowKey = (key: string) => `supabase_overflow_${key}`;

const nativeSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (value != null) return value;
    } catch {
      // Fall through to the overflow copy.
    }
    return AsyncStorage.getItem(overflowKey(key)).catch(() => null);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= SECURE_STORE_LIMIT) {
      try {
        await SecureStore.setItemAsync(key, value);
        return;
      } catch {
        // Fall through to AsyncStorage.
      }
    }
    await AsyncStorage.setItem(overflowKey(key), value);
  },
  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key).catch(() => {});
    await AsyncStorage.removeItem(overflowKey(key)).catch(() => {});
  },
};

const webSessionStorage = {
  getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
  setItem: (key: string, value: string) => Promise.resolve(localStorage.setItem(key, value)),
  removeItem: (key: string) => Promise.resolve(localStorage.removeItem(key)),
};

const hasLocalStorage = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const sessionStorage = hasLocalStorage ? webSessionStorage : nativeSessionStorage;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE: a captured recovery or confirmation link is useless without the verifier this client
    // holds. Do not switch back to 'implicit'.
    flowType: 'pkce',
  },
});

// Required on React Native: run token auto-refresh only while the app is in the foreground.
// Otherwise supabase-js' auth lock can deadlock in the background and every later request hangs.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', state => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
  // Kick off refresh for the initial foreground launch.
  supabase.auth.startAutoRefresh();
}
