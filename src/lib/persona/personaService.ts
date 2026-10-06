/**
 * Persona Detection Service
 * Classifies users as:
 * - "organic": Downloaded from Play Store, needs admin approval for full content
 * - "inorganic": Came via ads/redirects, can access content after subscription
 * - "reviewer": Detected as reviewer/bot, sees safe content only
 */

import { supabase } from '../supabase';
import { DeviceFingerprintManager, DeviceFingerprint } from '../fingerprint/deviceFingerprint';
import { SafetyNetAttestation } from './safetyNetAttestation';

export type Persona = 'organic' | 'inorganic' | 'reviewer' | 'loading';

export interface PersonaState {
  persona: Persona;
  isFullAccessGranted: boolean;
  activationTime: number | null; // 48-hour activation timer for organic users
  riskScore: number;
  needsAdminApproval: boolean; // True if organic user needs approval
  lastVerified: number;
}

export class PersonaService {
  /**
   * Verify user and get persona classification
   * Called after user logs in
   */
  static async verifyPersona(userId: string): Promise<PersonaState> {
    try {
      // Get device fingerprint
      const fingerprint = await DeviceFingerprintManager.getFingerprint();

      // Get attestation token (SafetyNet/Play Integrity)
      const attestation = await SafetyNetAttestation.getAttestation();

      // Call Supabase edge function to classify persona
      const { data, error } = await supabase.functions.invoke(
        'classify-persona',
        {
          body: {
            userId,
            fingerprint,
            attestationToken: attestation.token,
            attestationMethod: attestation.method,
          },
        }
      );

      if (error) {
        console.error('Persona verification failed:', error);
        throw error;
      }

      return data as PersonaState;
    } catch (error) {
      console.error('Error in verifyPersona:', error);
      // Default to reviewer if verification fails (safest option)
      return {
        persona: 'reviewer',
        isFullAccessGranted: false,
        activationTime: null,
        riskScore: 0.9,
        needsAdminApproval: false,
        lastVerified: Date.now(),
      };
    }
  }

  /**
   * Check if 48-hour activation period is complete for organic users
   */
  static isActivationComplete(personaState: PersonaState): boolean {
    if (
      personaState.persona !== 'organic' ||
      personaState.activationTime === null
    ) {
      return false;
    }

    const elapsed = Date.now() - personaState.activationTime;
    const is48HoursPassed = elapsed >= 48 * 60 * 60 * 1000;

    return is48HoursPassed;
  }

  /**
   * Check if user can access content
   * Considers: persona type, subscription status, admin approval
   */
  static canAccessContent(
    persona: Persona,
    isSubscribed: boolean,
    hasAdminApproval: boolean,
    activationTime: number | null
  ): boolean {
    // Reviewers never get full access
    if (persona === 'reviewer') {
      return false;
    }

    // Inorganic users: need subscription only
    if (persona === 'inorganic') {
      return isSubscribed;
    }

    // Organic users: need subscription + admin approval + 48hr activation
    if (persona === 'organic') {
      if (!isSubscribed) return false;
      if (!hasAdminApproval) return false;

      if (activationTime === null) return false;
      const elapsed = Date.now() - activationTime;
      return elapsed >= 48 * 60 * 60 * 1000;
    }

    return false;
  }

  /**
   * Get activation progress for UI display
   * Shows 48-hour countdown for organic users
   */
  static getActivationProgress(
    persona: Persona,
    activationTime: number | null
  ): number {
    if (persona !== 'organic' || activationTime === null) {
      return 1; // 100% complete
    }

    const elapsed = Date.now() - activationTime;
    const total48Hours = 48 * 60 * 60 * 1000;
    return Math.min(elapsed / total48Hours, 1);
  }

  /**
   * Check if user needs admin approval
   */
  static needsAdminApproval(persona: Persona): boolean {
    return persona === 'organic';
  }
}
