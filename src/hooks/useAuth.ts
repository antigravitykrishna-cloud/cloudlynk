import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, Database } from '@/lib/supabase';
import { isPlanActive } from '@/lib/plan';
import { queryClient } from '@/lib/queryClient';
import { UploadQueue } from '@/lib/video/uploadQueue';
import { ComplianceService, isAdultOnFile } from '@/lib/data/compliance';
import { config, isGoogleAuthLive } from '@/lib/config';

type Profile = Database['public']['Tables']['profiles']['Row'];

// Shared profile store. useAuth() is a plain hook, so each caller has its own state; the profile
// lives at module scope so one fetch updates every screen (otherwise a screen could keep routing on
// a stale copy). Session and user stay per-instance: every instance subscribes to onAuthStateChange
// and they converge on their own.
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
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
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
  // Whether the current session's profile has been fetched at least once. The root layout waits for
  // it before deciding whether to show complete-profile, so a fresh sign-in is not bounced there
  // for a moment.
  const profileChecked = useSyncExternalStore(
    subscribeToProfile,
    getSharedProfileChecked,
    getSharedProfileChecked,
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

  // Passwordless email: a 6-digit code signs in or creates the account. New accounts then pass the
  // 18+ gate and policy acceptance (app/_layout.tsx). Password sign-in remains for accounts that
  // already have one.
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

  // Guest: a real anonymous Supabase account with its own id. The database blocks uploads, joining
  // and payment orders for guests. Linking Google or an email later keeps the same id, so nothing
  // is lost.
  async function signInAsGuest() {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }

  /**
   * Step 1 of saving a guest account with an email: sends a 6-digit code.
   * Returns true when no code is needed -- with "Confirm email" off in the
   * Supabase dashboard, a guest's email is attached immediately.
   */
  async function linkEmailStart(email: string): Promise<boolean> {
    const addr = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.updateUser({ email: addr });
    if (error) throw error;
    const linked = !data.user?.is_anonymous && data.user?.email?.toLowerCase() === addr;
    if (linked && user) await fetchProfile(user.id, true);
    return linked;
  }

  /** Step 2: the code from the email. The account stops being a guest. */
  async function linkEmailVerify(email: string, code: string) {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email_change',
    });
    if (error) throw error;
    if (user) await fetchProfile(user.id, true);
  }

  /** Saves a guest account by linking the person's Google account to it. */
  async function linkGoogle() {
    const idToken = await googleIdToken();
    const { error } = await supabase.auth.linkIdentity({ provider: 'google', token: idToken });
    if (error) throw error;
    if (user) await fetchProfile(user.id, true);
  }

  /**
   * Native Google Sign-In, then the ID token goes to Supabase (no browser redirect). The
   * library is loaded on first use, so builds without Google configured still start.
   */
  async function googleIdToken(): Promise<string> {
    if (!isGoogleAuthLive()) {
      throw new Error('Google sign-in is not configured in this build.');
    }

    let GoogleSignin: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, loaded on first use
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
    return idToken;
  }

  async function signInWithGoogle() {
    const idToken = await googleIdToken();
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) throw error;
  }

  // Fills in what complete-profile found missing: the 18+ confirmation (confirm_adult) and/or
  // acceptance of the current policies.
  async function completeProfile() {
    if (!user) throw new Error('Not authenticated');
    if (!isAdultOnFile(profile)) {
      const { error } = await supabase.rpc('confirm_adult');
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

    // Record policy acceptance here, before the first profile fetch, so the cached profile already
    // includes it (otherwise the root layout would see a stale copy and send the new account to
    // complete-profile). Not fatal: complete-profile is the recovery path, and the server re-checks
    // before any upload.
    try {
      await ComplianceService.acceptTerms();
    } catch (err) {
      if (__DEV__) console.error('signUp: acceptTerms failed, deferring to complete-profile:', err);
    }

    await fetchProfile(data.user.id, true);
  }

  /**
   * Send a password-reset email. `redirectTo` reopens the app on the reset screen and must be in
   * Supabase's Redirect URLs list. Resolves the same way whether or not the address has an account.
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
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
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

  const refreshProfile = useCallback(
    async function refreshProfile() {
      if (user) await fetchProfile(user.id, true);
    },
    [user, fetchProfile],
  );

  // Account approval (who may buy Premium). Defaults to 'approved' while the profile loads so the
  // "under review" state never flashes. Presentation only -- the server enforces approval.
  const approvalStatus = (profile?.approval_status as string | undefined) ?? 'approved';
  const isApproved = approvalStatus === 'approved';

  const planStatus = profile?.plan_status ?? 'free';
  const hasActivePlan = isPlanActive(profile);
  // Admins have access to everything without a plan.
  const isPaidUser = hasActivePlan || !!profile?.is_admin;

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
    signInAsGuest,
    linkEmailStart,
    linkEmailVerify,
    linkGoogle,
    isGuest: !!user?.is_anonymous,
    signUp,
    completeProfile,
    signOut,
    deleteAccount,
    refreshProfile,
    canUpload: !!(profile?.can_upload_content || profile?.is_admin),
    isAdmin: !!profile?.is_admin,
    requestPasswordReset,
    updatePassword,
    planStatus,
    approvalStatus,
    isApproved,
    hasActivePlan,
    isPaidUser,
  };
}
