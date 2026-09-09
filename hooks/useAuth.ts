import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, Database } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { UploadQueue } from '../lib/uploadQueue';
import { ComplianceService } from '../lib/compliance';
import { config, isGoogleAuthLive } from '../lib/config';

type Profile = Database['public']['Tables']['profiles']['Row'];

// ── Shared profile store ─────────────────────────────────────────────
// useAuth() is a plain hook, not a context provider, so each of the ~25
// components that call it gets its own useState. The profile used to live
// in that per-instance state, which meant a fetch triggered by one screen
// never reached any other screen's copy.
//
// That silently broke the signup flow. complete-profile.tsx would accept
// the terms successfully and re-fetch — but only into ITS instance. The
// copy app/_layout.tsx routes on was never updated, so the root redirect
// kept reading terms_accepted_at = null and never sent the session to
// /(tabs). The write succeeded and the screen simply sat there.
//
// Hoisting the profile to module scope means every instance reads one
// value and a single fetch notifies all of them. Session/user are left in
// per-instance state on purpose: every instance subscribes to
// onAuthStateChange, so those already converge on their own — it is only
// the imperatively-fetched profile that could drift.
let sharedProfile: Profile | null = null;
let sharedProfileChecked = false;
const profileListeners = new Set<() => void>();

// Deduplicates the burst of identical fetches that fires when many mounted
// screens react to the same auth event.
let inFlightUserId: string | null = null;
let inFlightFetch: Promise<void> | null = null;

function emitProfileChange() {
  profileListeners.forEach(listener => listener());
}

function subscribeToProfile(listener: () => void) {
  profileListeners.add(listener);
  return () => {
    profileListeners.delete(listener);
  };
}

function getSharedProfile() {
  return sharedProfile;
}

function getSharedProfileChecked() {
  return sharedProfileChecked;
}

function clearSharedProfile() {
  sharedProfile = null;
  sharedProfileChecked = false;
  inFlightUserId = null;
  inFlightFetch = null;
  emitProfileChange();
}

async function loadSharedProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  // Keep the previous value on a failed read rather than blanking it —
  // a transient network error must not look like "profile is missing" to
  // the root redirect. `checked` still flips so callers stop waiting.
  if (!error && data) sharedProfile = data as Profile;
  sharedProfileChecked = true;
  emitProfileChange();
}

// `force` skips the dedupe. Anything that has just WRITTEN to the profile
// (accepting the terms, an admin action, a completed purchase) must not be
// allowed to attach to a read that was already in flight before that write
// landed — it would resolve with pre-write data and reintroduce exactly the
// staleness this store exists to remove.
function fetchSharedProfile(userId: string, force = false): Promise<void> {
  if (!force && inFlightFetch && inFlightUserId === userId) return inFlightFetch;
  inFlightUserId = userId;
  inFlightFetch = loadSharedProfile(userId).finally(() => {
    inFlightFetch = null;
    inFlightUserId = null;
  });
  return inFlightFetch;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const profile = useSyncExternalStore(subscribeToProfile, getSharedProfile, getSharedProfile);
  // Tracks whether the CURRENT session's profile row has been fetched at
  // least once. Distinct from `loading` (which only covers the initial
  // getSession() round-trip): the root layout's "does this account still
  // need to complete its profile" redirect (app/_layout.tsx) must not fire
  // off a stale/empty `profile` while the fetch after a fresh sign-in is
  // still in flight, or it'll bounce a legitimate user through
  // complete-profile for a split second on every login.
  const profileChecked = useSyncExternalStore(
    subscribeToProfile, getSharedProfileChecked, getSharedProfileChecked,
  );

  const fetchProfile = useCallback(function fetchProfile(userId: string, force = false) {
    return fetchSharedProfile(userId, force);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        clearSharedProfile();
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [fetchProfile]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  // ── Passwordless email ───────────────────────────────────────
  //
  // The one-tap flow: a 6-digit code to the address, no password to choose,
  // remember or reset. signInWithPassword stays for accounts that already have
  // a password — removing it would lock them out.
  //
  // shouldCreateUser is true because this is sign-IN and sign-UP at once,
  // which is the point: there is no separate signup screen in the new flow.
  // A first-time address gets a profile from the handle_new_user trigger with
  // no full_name and no birth_year, and app/_layout.tsx routes it to
  // complete-profile for the 18+ gate and policy acceptance before it reaches
  // the tabs. The age gate is not optional — see docs/PLAY_STORE_COMPLIANCE_AUDIT.md.
  async function sendEmailCode(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  }

  async function verifyEmailCode(email: string, code: string) {
    // type 'email' covers both the first-time and returning case; 'signup'
    // would reject a code issued to an address that already has an account.
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (error) throw error;
  }

  // ── Google ───────────────────────────────────────────────────
  //
  // Native Google Sign-In, then hand the ID token to Supabase. NOT
  // signInWithOAuth: that opens a browser and needs a redirect URL, which on
  // Android means a custom scheme and an intent filter — more moving parts,
  // and a visibly worse flow than the native account picker.
  //
  // The module is lazy-required (same approach as lib/ads.ts) so that a build
  // without the native package installed still runs: this is dead code until
  // GOOGLE_WEB_CLIENT_ID is set, and a top-level import would crash the whole
  // auth screen at load time in Expo Go or any build predating the config.
  async function signInWithGoogle() {
    if (!isGoogleAuthLive()) {
      throw new Error('Google sign-in is not configured in this build.');
    }

    let GoogleSignin: any;
    try {
      ({ GoogleSignin } = require('@react-native-google-signin/google-signin'));
    } catch {
      throw new Error('Google sign-in is unavailable in this build.');
    }

    GoogleSignin.configure({ webClientId: config.googleWebClientId });
    await GoogleSignin.hasPlayServices();
    const result = await GoogleSignin.signIn();

    // The token moved between library majors: v13+ returns it under `data`,
    // older versions at the top level. Read both rather than pinning a shape
    // that a routine dependency bump would break.
    const idToken: string | undefined = result?.data?.idToken ?? result?.idToken;
    if (!idToken) throw new Error('Google did not return an ID token.');

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) throw error;
  }

  // Fills in whatever complete-profile.tsx found missing: the birth year
  // (for the 18+ gate) and/or Terms/Guidelines/Privacy acceptance.
  //
  // `set_birth_year` (v51) is deliberately one-shot — it raises "Birth year
  // is already set." rather than silently overwriting, so an age can't be
  // re-rolled after the fact. That means it must only be called when the
  // profile genuinely has no birth year: an email/password signup already
  // has one (handle_new_user reads it out of the signup metadata), and
  // calling it again threw before acceptTerms could run, stranding the
  // account on this screen with no way forward. Skip it in that case and
  // go straight to the acceptance, which is the part actually missing.
  async function completeProfile(birthYear?: number) {
    if (!user) throw new Error('Not authenticated');
    if (!profile?.birth_year) {
      if (!birthYear) throw new Error('Birth year is required.');
      const { error } = await supabase.rpc('set_birth_year', { p_birth_year: birthYear });
      if (error) throw error;
    }
    await ComplianceService.acceptTerms();
    await fetchProfile(user.id, true);
  }

  async function signUp(email: string, password: string, fullName: string, birthYear?: number) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim(), birth_year: birthYear ?? null },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Signup failed — no user returned.');

    await new Promise(resolve => setTimeout(resolve, 500));

    // Record the versioned policy acceptance HERE, before the first profile
    // fetch below — not in the calling screen afterwards. The checkbox on
    // app/(auth)/signup.tsx is the acceptance; this persists it.
    //
    // Ordering is the whole point: this used to run in signup.tsx *after*
    // signUp() had already cached the profile, so the cached copy still had
    // terms_accepted_at = null. app/_layout.tsx then read that stale copy,
    // decided the account hadn't accepted anything, and bounced a perfectly
    // valid brand-new signup to complete-profile.
    //
    // Non-fatal on purpose: the account already exists by this point, so
    // failing the whole signup over it would be worse. can_create_ugc
    // re-blocks server-side at upload time, and complete-profile is the
    // recovery path — it collects the acceptance properly now.
    try {
      await ComplianceService.acceptTerms();
    } catch (err) {
      if (__DEV__) console.error('signUp: acceptTerms failed, deferring to complete-profile:', err);
    }

    await fetchProfile(data.user.id, true);
  }

  /**
   * Sends a password-reset email.
   *
   * `redirectTo` is a cloudlynk:// deep link, so the link in the email reopens
   * the app on the reset screen rather than a web page. That URL must also be
   * listed under Authentication -> URL Configuration -> Redirect URLs in the
   * Supabase dashboard; Supabase silently refuses to redirect anywhere that is
   * not on that allow-list, and the symptom is a link that appears to do
   * nothing.
   *
   * Resolves the same way whether or not the address has an account. Telling a
   * caller "no such user" turns this into an endpoint for discovering who is
   * registered.
   */
  async function requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'cloudlynk://reset-password',
    });
    // A rate-limit is worth surfacing — the user can act on it by waiting.
    // Anything else is swallowed so the response cannot be used to probe.
    if (error && /rate limit|too many/i.test(error.message)) throw error;
  }

  /**
   * Sets a new password. Only works while the recovery link's session is
   * active, which Supabase establishes when the deep link opens the app.
   */
  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async function signOut() {
    await UploadQueue.destroy();
    await supabase.auth.signOut();
    queryClient.clear();
    try {
      await AsyncStorage.removeItem('cloudlynk-query-cache');
    } catch {
      // Non-fatal — in-memory cache is already cleared.
    }
    clearSharedProfile();
    setSession(null);
    setUser(null);
  }

  async function deleteAccount() {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) throw new Error('Not authenticated');
    const fnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`;
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Failed to delete account');
    await supabase.auth.signOut();
  }

  const refreshProfile = useCallback(async function refreshProfile() {
    if (user) await fetchProfile(user.id, true);
  }, [user, fetchProfile]);

  const storagePercentage = profile
    ? Math.min((profile.storage_used / profile.storage_limit) * 100, 100)
    : 0;

  // v55 pre-purchase approval gate. Defaults to 'approved' while the profile
  // row is still loading (or on a client running against a pre-v55 DB) so a
  // momentarily-absent profile never flashes the "under review" state at an
  // account that is in fact approved. The gate's real enforcement is the
  // admin-only RPC + trigger in the v55 migration; this is presentation only,
  // and it deliberately gates nothing except reaching app/premium.tsx's plan
  // list — never playback, uploads, or anything already paid for.
  const approvalStatus = (profile?.approval_status as string | undefined) ?? 'approved';
  const isApproved = approvalStatus === 'approved';

  const planStatus = (profile as Record<string, unknown>)?.plan_status as string | undefined ?? 'free';
  const planExpiresAt = (profile as Record<string, unknown>)?.plan_expires_at as string | null ?? null;
  const isActive = planStatus === 'active' && (!planExpiresAt || new Date(planExpiresAt) > new Date());
  const isPaidUser = isActive || planStatus === 'lifetime' || !!(profile?.is_admin);

  return {
    session,
    user,
    profile,
    loading,
    profileChecked,
    signIn,
    sendEmailCode,
    verifyEmailCode,
    signInWithGoogle,
    signUp,
    completeProfile,
    signOut,
    deleteAccount,
    refreshProfile,
    storagePercentage,
    isAuthenticated: !!session,
    canUpload: !!(profile?.can_upload_content || profile?.is_admin),
    isAdmin: !!(profile?.is_admin),
    requestPasswordReset,
    updatePassword,
    planStatus,
    approvalStatus,
    isApproved,
    isPaidUser,
    isActive,
    isExpired: planStatus === 'expired' || (planStatus === 'active' && !!planExpiresAt && new Date(planExpiresAt) <= new Date()),
    isCancelled: planStatus === 'cancelled',
    isLifetime: planStatus === 'lifetime',
  };
}
