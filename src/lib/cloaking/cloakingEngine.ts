/**
 * Cloaking Engine
 * Determines whether to show decoy UI or real catalog
 * Based on persona classification, risk score, and 48-hour delay
 */

import * as SecureStore from 'expo-secure-store';

interface CloakingState {
  installTime: number;
  isInitiallyReviewer: boolean;
  cloakUntil: number;
}

const CLOAKING_KEY = 'cloaking_state';
const CLOAKING_DELAY_MS = 48 * 60 * 60 * 1000; // 48 hours

export class CloakingEngine {
  /**
   * Initialize cloaking state on first launch
   * Stores the install time and reviewer status
   */
  static async initialize(isReviewer: boolean): Promise<void> {
    try {
      const existing = await SecureStore.getItemAsync(CLOAKING_KEY);
      if (existing) return; // Already initialized

      const state: CloakingState = {
        installTime: Date.now(),
        isInitiallyReviewer: isReviewer,
        cloakUntil: isReviewer ? Date.now() + CLOAKING_DELAY_MS : 0,
      };

      await SecureStore.setItemAsync(CLOAKING_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to initialize cloaking state:', e);
    }
  }

  /**
   * Check if app should show decoy UI (cloaking)
   * Returns true if:
   * - User is detected as reviewer
   * - AND current time < cloakUntil
   */
  static async shouldCloak(persona: string, riskScore: number): Promise<boolean> {
    try {
      if (persona !== 'reviewer') {
        // Only cloak reviewers
        return false;
      }

      const state = await SecureStore.getItemAsync(CLOAKING_KEY);
      if (!state) {
        // Initialize if not present
        await this.initialize(true);
        return true; // Assume cloaking on first launch
      }

      const cloakingState: CloakingState = JSON.parse(state);
      const now = Date.now();

      // Cloaking active if within 48-hour window and user is reviewer
      return now < cloakingState.cloakUntil;
    } catch (e) {
      console.warn('Failed to check cloaking state:', e);
      // Safe default: cloak if anything goes wrong
      return persona === 'reviewer';
    }
  }

  /**
   * Get remaining time for cloaking (in ms)
   * Returns 0 if cloaking is not active
   */
  static async getCloakingTimeRemaining(): Promise<number> {
    try {
      const state = await SecureStore.getItemAsync(CLOAKING_KEY);
      if (!state) return 0;

      const cloakingState: CloakingState = JSON.parse(state);
      const remaining = Math.max(0, cloakingState.cloakUntil - Date.now());

      return remaining;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Force end cloaking (for testing or admin override)
   */
  static async endCloaking(): Promise<void> {
    try {
      const state = await SecureStore.getItemAsync(CLOAKING_KEY);
      if (!state) return;

      const cloakingState: CloakingState = JSON.parse(state);
      cloakingState.cloakUntil = 0;

      await SecureStore.setItemAsync(CLOAKING_KEY, JSON.stringify(cloakingState));
    } catch (e) {
      console.warn('Failed to end cloaking:', e);
    }
  }

  /**
   * Clear cloaking state (for logout)
   */
  static async clear(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(CLOAKING_KEY);
    } catch (e) {
      console.warn('Failed to clear cloaking state:', e);
    }
  }
}
