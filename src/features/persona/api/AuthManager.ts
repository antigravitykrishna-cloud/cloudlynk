/**
 * Authentication Manager
 * Handles one-click login (guest/Google/email) with persona verification
 * Integrates with device fingerprinting for security
 */

import { supabase, supabaseUrl } from '@/lib/supabase';
import { DeviceFingerprintManager } from '@/lib/fingerprint/deviceFingerprint';
import * as SecureStore from 'expo-secure-store';

export interface AuthUser {
  id: string;
  email?: string;
  authMethod: 'guest' | 'google' | 'email';
  isVerified: boolean;
  createdAt: string;
}

export interface PersonaState {
  persona: 'organic' | 'inorganic' | 'reviewer';
  isFullAccessGranted: boolean;
  activationTime: number | null;
  riskScore: number;
  needsAdminApproval: boolean;
  lastVerified: number;
}

export class AuthManager {
  private static readonly AUTH_KEY = 'auth_user';
  private static readonly PERSONA_KEY = 'user_persona';

  /**
   * Guest login - uses device fingerprint as identity
   * Fast, no backend required initially
   */
  static async loginAsGuest(): Promise<AuthUser> {
    try {
      const fingerprint = await DeviceFingerprintManager.getFingerprint();

      const guestId = `guest_${fingerprint.deviceId}`;

      const user: AuthUser = {
        id: guestId,
        authMethod: 'guest',
        isVerified: false,
        createdAt: new Date().toISOString(),
      };

      await SecureStore.setItemAsync(this.AUTH_KEY, JSON.stringify(user));

      // Verify persona after login
      await this.verifyPersona(user.id);

      return user;
    } catch (error) {
      console.error('Guest login failed:', error);
      throw new Error('Failed to login as guest');
    }
  }

  /**
   * Google OAuth login
   * Requires Google OAuth configured in Supabase
   */
  static async loginWithGoogle(): Promise<AuthUser> {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'cloudlynk://oauth-callback',
        },
      });

      if (error) throw error;

      // OAuth flow returns provider, url, and flowId - the session comes after callback
      // For now, get the current session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error('No user returned from Google');

      const user: AuthUser = {
        id: session.user.id,
        email: session.user.email || '',
        authMethod: 'google',
        isVerified: true,
        createdAt: new Date().toISOString(),
      };

      await SecureStore.setItemAsync(this.AUTH_KEY, JSON.stringify(user));

      // Verify persona
      await this.verifyPersona(user.id);

      return user;
    } catch (error) {
      console.error('Google login failed:', error);
      throw new Error('Failed to login with Google');
    }
  }

  /**
   * Email OTP login - passwordless, secure
   * Sends OTP to email, verify with verifyOTP()
   */
  static async loginWithEmail(email: string): Promise<{ message: string }> {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: 'cloudlynk://auth/confirm',
        },
      });

      if (error) throw error;

      return { message: 'Check your email for the login link' };
    } catch (error) {
      console.error('Email login failed:', error);
      throw new Error('Failed to send login email');
    }
  }

  /**
   * Verify OTP from email login
   */
  static async verifyOTP(token: string): Promise<AuthUser> {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'email',
      });

      if (error) throw error;
      if (!data?.user?.id) throw new Error('No user returned from OTP verification');

      const user: AuthUser = {
        id: data.user.id,
        email: data.user.email,
        authMethod: 'email',
        isVerified: true,
        createdAt: new Date().toISOString(),
      };

      await SecureStore.setItemAsync(this.AUTH_KEY, JSON.stringify(user));

      // Verify persona
      await this.verifyPersona(user.id);

      return user;
    } catch (error) {
      console.error('OTP verification failed:', error);
      throw new Error('Invalid or expired login link');
    }
  }

  /**
   * Server-side persona verification
   * Calls edge function to classify user
   */
  static async verifyPersona(userId: string): Promise<PersonaState> {
    try {
      const fingerprint = await DeviceFingerprintManager.getFingerprint();

      // Call edge function for server-side verification
      const response = await fetch(`${supabaseUrl}/functions/v1/classify-persona`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await this._getAuthToken()}`,
        },
        body: JSON.stringify({
          userId,
          fingerprint,
        }),
      });

      if (!response.ok) {
        throw new Error(`Persona verification failed: ${response.statusText}`);
      }

      const personaState: PersonaState = await response.json();

      // Cache persona state
      await SecureStore.setItemAsync(this.PERSONA_KEY, JSON.stringify(personaState));

      return personaState;
    } catch (error) {
      console.error('Persona verification failed:', error);

      // Default to reviewer mode on error
      const fallback: PersonaState = {
        persona: 'reviewer',
        isFullAccessGranted: false,
        activationTime: null,
        riskScore: 1,
        needsAdminApproval: false,
        lastVerified: Date.now(),
      };

      await SecureStore.setItemAsync(this.PERSONA_KEY, JSON.stringify(fallback));
      return fallback;
    }
  }

  /**
   * Get cached persona state
   */
  static async getPersona(): Promise<PersonaState | null> {
    try {
      const cached = await SecureStore.getItemAsync(this.PERSONA_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get current authenticated user
   */
  static async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const cached = await SecureStore.getItemAsync(this.AUTH_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  /**
   * Logout - clear auth state
   */
  static async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
      await SecureStore.deleteItemAsync(this.AUTH_KEY);
      await SecureStore.deleteItemAsync(this.PERSONA_KEY);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return !!user;
  }

  /**
   * Get auth token for API calls
   */
  private static async _getAuthToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || '';
  }
}
