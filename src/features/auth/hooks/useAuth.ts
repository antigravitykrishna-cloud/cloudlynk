import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clearQueryCache } from '@/lib/queryClient';
import { authApi } from '@/features/auth/api/authApi';
import { complianceApi } from '@/features/auth/api/complianceApi';
import { describeAccess } from '@/features/auth/access';
import { isAdultOnFile } from '@/features/auth/policies';
import { profileStore } from '@/features/auth/profileStore';
import { UploadQueue } from '@/features/upload/uploadQueue';

/**
 * Who is signed in, their profile, what they may do, and every sign-in and account action.
 *
 * Each caller follows the session itself (they all converge through onSessionChange); the profile
 * is shared by every caller through profileStore.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const user = session?.user ?? null;
  const userId = user?.id;

  const profile = useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getProfile,
    profileStore.getProfile,
  );
  // The root layout waits for this before deciding whether to show complete-profile, so a fresh
  // sign-in is not bounced there for a moment on a stale (empty) profile.
  const profileChecked = useSyncExternalStore(
    profileStore.subscribe,
    profileStore.isChecked,
    profileStore.isChecked,
  );

  useEffect(() => {
    authApi.getSession().then(current => {
      setSession(current);
      if (current) profileStore.load(current.user.id);
      setLoading(false);
    });

    return authApi.onSessionChange(next => {
      setSession(next);
      if (next) profileStore.load(next.user.id);
      else profileStore.clear();
    });
  }, []);

  /** Re-reads the profile after something changed it (a purchase, an accepted policy). */
  const refreshProfile = useCallback(async () => {
    if (userId) await profileStore.load(userId, { force: true });
  }, [userId]);

  async function linkEmail(email: string): Promise<boolean> {
    const linked = await authApi.linkEmail(email);
    if (linked) await refreshProfile();
    return linked;
  }

  async function confirmLinkedEmail(email: string, code: string) {
    await authApi.confirmLinkedEmail(email, code);
    await refreshProfile();
  }

  async function linkGoogle() {
    await authApi.linkGoogle();
    await refreshProfile();
  }

  /** Records whatever complete-profile found missing: the 18+ answer and/or policy acceptance. */
  async function completeProfile() {
    if (!user) throw new Error('Not authenticated');
    if (!isAdultOnFile(profile)) await complianceApi.confirmAdult();
    await complianceApi.acceptCurrentPolicies();
    await refreshProfile();
  }

  async function signUp(email: string, password: string, fullName: string, birthYear?: number) {
    const newUserId = await authApi.signUp({ email, password, fullName, birthYear });

    // Lets the new session settle before the first authenticated calls.
    await new Promise(resolve => setTimeout(resolve, 500));

    // The signup form's checkbox is the policy acceptance. Record it before the first profile
    // fetch, so the cached profile already has it and the root layout does not send the new
    // account to complete-profile. Not fatal: complete-profile is the fallback.
    try {
      await complianceApi.acceptCurrentPolicies();
    } catch (err) {
      if (__DEV__) console.error('signUp: policy acceptance deferred to complete-profile:', err);
    }

    await profileStore.load(newUserId, { force: true });
  }

  /** Signs out and forgets everything this device kept for the account. */
  async function signOut() {
    await UploadQueue.destroy();
    await authApi.signOut();
    await clearQueryCache();
    profileStore.clear();
    setSession(null);
  }

  return {
    session,
    user,
    profile,
    loading,
    profileChecked,
    ...describeAccess(profile, user),

    sendEmailCode: authApi.sendEmailCode,
    verifyEmailCode: authApi.verifyEmailCode,
    signInWithGoogle: authApi.signInWithGoogle,
    signInAsGuest: authApi.signInAsGuest,
    signUp,
    requestPasswordReset: authApi.requestPasswordReset,
    updatePassword: authApi.updatePassword,
    linkEmail,
    confirmLinkedEmail,
    linkGoogle,
    completeProfile,
    refreshProfile,
    signOut,
    deleteAccount: authApi.deleteAccount,
  };
}
