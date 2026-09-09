import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

// ── Credentials from environment ─────────────────────────────
const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  '';

const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  '';

// Fail loudly, at launch, if the build has no backend credentials.
//
// EXPO_PUBLIC_* variables are inlined by Metro at BUNDLE time, from whatever
// .env the bundler could see. An EAS cloud build cannot see .env at all: it is
// listed in .easignore (and .gitignore), and eas.json's `env` blocks set only
// APP_ENV. So unless the values are supplied another way, an `eas build`
// produces a bundle where both constants are '' -- createClient accepts that
// without complaint and every request then fails at runtime with an opaque
// network error. The app looks installed, opens, and does nothing.
//
// That failure is invisible until someone launches the artifact, which for a
// production AAB means after it has been uploaded to Play. Crashing here with
// a readable message is strictly better: it surfaces on the first launch of
// the first test build, and it names the fix.
//
// To fix: either add the two values to eas.json's env block for the profile
// being built (both are public by design -- they ship inside every APK, and
// RLS is the actual security boundary), or set them as EAS environment
// variables in the Expo dashboard. See DEPLOY.md 1.2.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Cloudlynk is not configured: EXPO_PUBLIC_SUPABASE_URL / ' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY were empty when this bundle was built. ' +
    'The bundler could not see them -- see DEPLOY.md 1.2.'
  );
}

// ── Storage adapter — SecureStore on native, localStorage on web ──
// This prevents the "localStorage is not defined" crash during SSR/bundling
const getStorageAdapter = () => {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    return {
      getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
      setItem: (key: string, value: string) => {
        localStorage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        localStorage.removeItem(key);
        return Promise.resolve();
      },
    };
  }

  try {
    const SecureStore = require('expo-secure-store');
    return {
      getItem: async (key: string) => {
        try {
          const secureValue = await SecureStore.getItemAsync(key);
          if (secureValue !== null && secureValue !== undefined) return secureValue;
          // Value may have been stored in AsyncStorage due to size overflow
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          return await AsyncStorage.getItem(`supabase_overflow_${key}`);
        } catch {
          try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            return await AsyncStorage.getItem(`supabase_overflow_${key}`);
          } catch {
            return null;
          }
        }
      },
      setItem: async (key: string, value: string) => {
        try {
          if (value && value.length > 2048) {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            await AsyncStorage.setItem(`supabase_overflow_${key}`, value);
          } else {
            await SecureStore.setItemAsync(key, value);
          }
        } catch {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.setItem(`supabase_overflow_${key}`, value);
        }
      },
      removeItem: async (key: string) => {
        try {
          await SecureStore.deleteItemAsync(key);
        } catch {}
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.removeItem(`supabase_overflow_${key}`);
        } catch {}
      },
    };
  } catch {
    const mem: Record<string, string> = {};
    return {
      getItem: (key: string) => Promise.resolve(mem[key] ?? null),
      setItem: (key: string, value: string) => { mem[key] = value; return Promise.resolve(); },
      removeItem: (key: string) => { delete mem[key]; return Promise.resolve(); },
    };
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorageAdapter(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE rather than the implicit flow. The app is email+password only
    // (there is no OAuth provider), so no redirect currently carries tokens
    // at all — but PKCE is the safer default for every auth flow Supabase
    // routes through a URL (password recovery, email confirmation links),
    // since a captured link is useless without the verifier this client
    // holds. Kept deliberately; do not switch back to 'implicit'.
    flowType: 'pkce',
  },
});

// ── Auto-refresh lifecycle (REQUIRED on React Native) ─────────
// supabase-js manages token refresh behind an internal auth lock. On native,
// that lock must be tied to the app's foreground state: if the auto-refresh
// timer is left running while the app is backgrounded (or during long XHR
// uploads), the lock can deadlock and every subsequent DB call — e.g. an
// insert — hangs forever with no network request ever firing.
// Driving start/stop from AppState is the fix Supabase mandates for RN.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
  // Kick off refresh for the initial foreground launch.
  supabase.auth.startAutoRefresh();
}

// ── Database types ───────────────────────────────────────────
export type Database = {
  public: {
    Tables: {

      profiles: {
        Row: {
          id: string;
          email: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          storage_used: number;
          storage_limit: number;
          plan: 'free' | 'standard' | 'premium';
          is_admin: boolean;
          role: 'user' | 'creator' | 'staff' | 'admin';
          can_upload_content: boolean;
          creator_status: 'none' | 'pending' | 'approved' | 'rejected';
          fcm_token: string | null;
          auto_backup: boolean;
          wifi_only: boolean;
          notifications_enabled: boolean;
          // Added by supabase/migrations/20260824120000_v46_compliance_hardening.sql
          // and 20260825090000_v48_ugc_moderation_and_entitlements.sql — these were
          // missing from this hand-maintained type even though the columns have
          // existed in the real schema since v46/v48, which made every read of
          // profile.birth_year / profile.terms_accepted_at (e.g. in
          // lib/compliance.ts and app/_layout.tsx) fail to type-check.
          account_status: 'active' | 'suspended' | 'banned';
          terms_accepted_at: string | null;
          terms_version: string | null;
          community_guidelines_version: string | null;
          privacy_version: string | null;
          birth_year: number | null;
          // Added by supabase/migrations/20260905120000_v55_user_approval_gate.sql.
          // PRE-purchase vetting gate: 'pending' accounts keep a full free tier
          // but don't reach the subscribe flow. Never consulted after payment —
          // see the migration header and verify-play-receipt.
          approval_status: 'pending' | 'approved' | 'rejected';
          approval_reviewed_by: string | null;
          approval_reviewed_at: string | null;
          approval_note: string | null;
          created_at: string;
          updated_at: string;
        };
        // The omitted columns are all DB- or trigger-managed and rejected on a
        // client write by protect_profile_privileged_fields() — including the
        // v55 approval_* set, which only admin_set_user_approval() may move.
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at' | 'role' | 'can_upload_content' | 'creator_status' | 'approval_status' | 'approval_reviewed_by' | 'approval_reviewed_at' | 'approval_note'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };

      files: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          size: number;
          mime_type: string;
          storage_path: string;
          category: 'photo' | 'video' | 'document' | 'audio' | 'other';
          channel_id: string | null;
          is_public: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['files']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['files']['Insert']>;
      };

      channels: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          description: string | null;
          is_public: boolean;
          status: 'pending' | 'active' | 'suspended';
          member_count: number;
          post_count: number;
          media_size: number;
          approval_expires_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['channels']['Row'], 'id' | 'member_count' | 'post_count' | 'media_size' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['channels']['Insert']>;
      };

      channel_members: {
        Row: {
          channel_id: string;
          user_id: string;
          role: 'owner' | 'moderator' | 'member';
          joined_at: string;
        };
        Insert: Omit<Database['public']['Tables']['channel_members']['Row'], 'joined_at'>;
        Update: Partial<Database['public']['Tables']['channel_members']['Insert']>;
      };

      channel_posts: {
        Row: {
          id: string;
          channel_id: string;
          author_id: string;
          title: string | null;
          body: string | null;
          media_url: string | null;
          media_type: 'image' | 'video' | null;
          thumbnail_url: string | null;
          video_url: string | null;
          content_type: 'movie' | 'series' | 'short' | 'post' | null;
          genre: string | null;
          duration_min: number | null;
          season_number: number | null;
          episode_number: number | null;
          episode_title: string | null;
          release_year: number | null;
          tags: string[] | null;
          status: 'draft' | 'pending' | 'approved' | 'rejected';
          approved_by: string | null;
          approved_at: string | null;
          rejection_note: string | null;
          submitted_at: string | null;
          series_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['channel_posts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['channel_posts']['Insert']>;
      };

      transfers: {
        Row: {
          id: string;
          user_id: string;
          file_name: string;
          file_size: number;
          progress: number;
          status: 'uploading' | 'downloading' | 'completed' | 'failed' | 'paused';
          type: 'upload' | 'download';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['transfers']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['transfers']['Insert']>;
      };

      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: 'channel_approved' | 'channel_rejected' | 'post_approved' | 'post_rejected';
          title: string;
          body: string;
          channel_id: string | null;
          post_id: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
      };

      content_reports: {
        Row: {
          id: string;
          channel_id: string | null;
          file_id: string | null;
          reporter_id: string;
          reason: string;
          status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['content_reports']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['content_reports']['Insert']>;
      };

      series: {
        Row: {
          id: string;
          channel_id: string;
          owner_id: string;
          title: string;
          description: string | null;
          thumbnail_url: string | null;
          genre: string | null;
          release_year: number | null;
          status: 'pending' | 'approved' | 'rejected';
          approved_by: string | null;
          approved_at: string | null;
          rejection_note: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['series']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['series']['Insert']>;
      };

    };
  };
};
