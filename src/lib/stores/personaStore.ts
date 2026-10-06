/**
 * Persona Store
 * Global state management for persona detection and access control
 * Uses Zustand for efficient state updates
 */

import { create } from 'zustand';
import { hasFullAccess, isActivated as isActivatedFn } from '@/features/persona/access';
import { AuthManager, PersonaState } from '@/features/persona/api/AuthManager';
import { isPlanActive } from '@/features/premium/planStatus';
import { profileStore } from '@/features/auth/profileStore';
import { CloakingEngine } from '@/lib/cloaking/cloakingEngine';

export interface PersonaStore {
  // Persona state
  persona: PersonaState | null;
  isLoading: boolean;
  error: string | null;

  // Subscription comes from profile.plan_status (integrated with existing premium system)
  isSubscribed: boolean;

  // Access flags
  canAccessFullContent: boolean;
  needsAdminApproval: boolean;
  isRejected: boolean;
  isActivated: boolean;
  activationProgress: number; // 0-1

  // Derived fields
  riskScore: number;

  // Actions
  initializePersona: (userId: string) => Promise<void>;
  refreshPersona: (userId: string) => Promise<void>;
  checkAccess: () => boolean;
  reset: () => void;
}

export const usePersonaStore = create<PersonaStore>((set, get) => ({
  // Initial state
  persona: null,
  isLoading: false,
  error: null,
  isSubscribed: false,
  canAccessFullContent: false,
  needsAdminApproval: false,
  isRejected: false,
  isActivated: false,
  activationProgress: 0,
  riskScore: 0,

  // Initialize persona on app start
  initializePersona: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      // Verify persona on startup (calls edge function for fresh classification)
      const persona = await AuthManager.verifyPersona(userId);

      // Get subscription status from the profile (integrated with existing premium system)
      const profile = profileStore.getProfile();
      const isSubscribed = isPlanActive(profile);

      // Calculate access flags
      const canAccessFullContent = hasFullAccess(persona, isSubscribed);
      const isActivated = persona ? isActivatedFn(persona) : false;

      // Calculate activation progress
      let activationProgress = 0;
      if (persona && persona.persona === 'organic' && persona.activationTime) {
        const elapsed = Date.now() - persona.activationTime;
        const totalTime = 48 * 60 * 60 * 1000;
        activationProgress = Math.min(elapsed / totalTime, 1);
      } else if (persona) {
        activationProgress = 1;
      }

      // Initialize cloaking if reviewer
      if (persona?.persona === 'reviewer') {
        await CloakingEngine.initialize(true);
      }

      set({
        persona,
        isSubscribed,
        canAccessFullContent,
        needsAdminApproval: persona?.needsAdminApproval || false,
        isRejected: persona?.isRejected || false,
        isActivated: isActivated || false,
        activationProgress,
        riskScore: persona?.riskScore || 0,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: String(error),
        isLoading: false,
        // Default to safe mode on error
        persona: {
          persona: 'reviewer',
          isFullAccessGranted: false,
          activationTime: null,
          riskScore: 1,
          needsAdminApproval: false,
          isRejected: false,
          lastVerified: Date.now(),
        },
      });
    }
  },

  // Refresh persona state
  refreshPersona: async (userId: string) => {
    set({ isLoading: true });
    try {
      await AuthManager.verifyPersona(userId);
      await get().initializePersona(userId);
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  // Check if user can access content
  checkAccess: () => {
    const { persona, isSubscribed } = get();
    return hasFullAccess(persona, isSubscribed);
  },

  // Reset store
  reset: () => {
    set({
      persona: null,
      isLoading: false,
      error: null,
      isSubscribed: false,
      canAccessFullContent: false,
      needsAdminApproval: false,
      isRejected: false,
      isActivated: false,
      activationProgress: 0,
    });
  },

  // Helper to calculate activation progress
  _calculateActivationProgress: (persona: PersonaState | null) => {
    if (!persona) return 0;
    if (persona.persona !== 'organic' || !persona.activationTime) return 1;

    const elapsed = Date.now() - persona.activationTime;
    const totalTime = 48 * 60 * 60 * 1000; // 48 hours
    const progress = Math.min(elapsed / totalTime, 1);

    return progress;
  },
}));
