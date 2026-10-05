import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { errorCode, errorMessage } from '@/utils/errors';
import { config, isGoogleAuthLive } from '@/lib/config';

// Sign-in, account linking and password calls against Supabase Auth. No React and no app state:
// useAuth composes these with the profile store.

/** Where the password-reset email sends people back to. Must be in Supabase's Redirect URLs. */
const PASSWORD_RESET_REDIRECT = 'cloudlynk://reset-password';

export const authApi = {
  async getSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  /** Calls `listener` on every sign-in, sign-out and token refresh. Returns the unsubscribe. */
  onSessionChange(listener: (session: Session | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(session));
    return () => data.subscription.unsubscribe();
  },

  /**
   * Passwordless email: sends a 6-digit code that signs in, creating the account if needed. New
   * accounts still pass the 18+ gate and policy acceptance (see complete-profile).
   */
  async sendEmailCode(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  },

  async verifyEmailCode(email: string, code: string): Promise<void> {
    // type 'email' covers new and returning accounts; 'signup' would reject a code issued to an
    // address that already has an account.
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (error) throw error;
  },

  /**
   * A real anonymous account with its own id. The database blocks uploads, joining and payment
   * orders for guests. Linking Google or an email later keeps the same id.
   */
  async signInAsGuest(): Promise<void> {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  },

  async signInWithGoogle(): Promise<void> {
    const token = await getGoogleIdToken();
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token });
    if (error) throw error;
  },

  /**
   * Saving a guest account, step 1: attaches an email and sends a 6-digit code. Resolves true when
   * no code is needed (with "Confirm email" off in Supabase, the email is attached at once).
   */
  async linkEmail(email: string): Promise<boolean> {
    const address = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.updateUser({ email: address });
    if (error) throw error;
    return !data.user?.is_anonymous && data.user?.email?.toLowerCase() === address;
  },

  /** Saving a guest account, step 2: the code from the email. The account stops being a guest. */
  async confirmLinkedEmail(email: string, code: string): Promise<void> {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email_change',
    });
    if (error) throw error;
  },

  /** Saves a guest account by linking the person's Google account to it. */
  async linkGoogle(): Promise<void> {
    const token = await getGoogleIdToken();
    const { error } = await supabase.auth.linkIdentity({ provider: 'google', token });
    if (error) throw error;
  },

  /** Email + password signup. Resolves with the new account's id. */
  async signUp(input: {
    email: string;
    password: string;
    fullName: string;
    birthYear?: number;
  }): Promise<string> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.fullName.trim(), birth_year: input.birthYear ?? null } },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Signup failed — no user returned.');
    return data.user.id;
  },

  /**
   * Sends a password-reset email. Resolves the same way whether or not the address has an account,
   * so the response cannot be used to find out who is registered.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: PASSWORD_RESET_REDIRECT,
    });
    // A rate limit is worth surfacing (the person can wait); anything else is swallowed.
    if (error && /rate limit|too many/i.test(error.message)) throw error;
  },

  /** Sets a new password. Works only while the reset link's recovery session is active. */
  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  /** Deletes the account and its data (delete-account function), then signs out. */
  async deleteAccount(): Promise<void> {
    const res = await callEdgeFunction(
      'delete-account',
      {},
      { signedOutMessage: 'Not authenticated' },
    );
    if (!res.ok) throw new Error(res.data?.error ?? 'Failed to delete account');
    await supabase.auth.signOut();
  },
};

/** Whether a Google sign-in error is the person backing out of the account picker. */
export function isSignInCancelled(err: unknown): boolean {
  const code = errorCode(err);
  return /cancel/i.test(errorMessage(err, '')) || code === '-5' || code === '12501';
}

/**
 * The part of @react-native-google-signin/google-signin used here. The package is optional (only in
 * builds with Google configured), so its types are not available to import.
 */
type GoogleSigninModule = {
  configure(options: { webClientId: string }): void;
  hasPlayServices(): Promise<boolean>;
  signIn(): Promise<{ data?: { idToken?: string | null } | null; idToken?: string | null } | null>;
};

/**
 * Native Google Sign-In; the ID token then goes to Supabase (no browser redirect). The library is
 * loaded on first use, so builds without Google configured still start.
 */
async function getGoogleIdToken(): Promise<string> {
  if (!isGoogleAuthLive()) throw new Error('Google sign-in is not configured in this build.');

  let GoogleSignin: GoogleSigninModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, loaded on first use
    ({ GoogleSignin } = require('@react-native-google-signin/google-signin'));
  } catch {
    throw new Error('Google sign-in is unavailable in this build.');
  }

  GoogleSignin.configure({ webClientId: config.googleWebClientId });
  await GoogleSignin.hasPlayServices();
  const result = await GoogleSignin.signIn();

  // v13+ of the library returns the token under `data`, older versions at the top level.
  const idToken = result?.data?.idToken ?? result?.idToken;
  if (!idToken) throw new Error('Google did not return an ID token.');
  return idToken;
}
