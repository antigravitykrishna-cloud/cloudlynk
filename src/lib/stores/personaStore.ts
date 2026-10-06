/**
 * Persona Store
 * Global state management for persona detection and access control
 * Uses Zustand for efficient state updates
 */

import { create } from 'zustand';
import { AuthManager, PersonaState } from '@/features/persona/api/AuthManager';
import { SubscriptionManager, SubscriptionInfo } from '@/features/persona/api/SubscriptionManager';
import { DeviceFingerprintManager } from '@/lib/fingerprint/deviceFingerprint';

export interface PersonaStore {
  // Persona state
  persona: PersonaState | null;
  isLoading: boolean;
  error: string | null;

  // Subscription state
  subscription: SubscriptionInfo | null;
  isSubscribed: boolean;
  daysUntilExpiry: number | null;

  // Access flags
  canAccessFullContent: boolean;
  needsAdminApproval: boolean;
  isActivated: boolean;
  activationProgress: number; // 0-1

  // Actions
  initializePersona: (userId: string) => Promise<void>;
  refreshPersona: (userId: string) => Promise<void>;
  updateSubscription: (userId: string) => Promise<void>;
  checkAccess: () => boolean;
  reset: () => void;
}

export const usePersonaStore = create<PersonaStore>((set, get) => ({
  // Initial state
  persona: null,
  isLoading: false,
  error: null,
  subscription: null,
  isSubscribed: false,
  daysUntilExpiry: null,
  canAccessFullContent: false,
  needsAdminApproval: false,
  isActivated: false,
  activationProgress: 0,

  // Initialize persona on app start
  initializePersona: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      // Get persona from auth manager
      const persona = await AuthManager.getPersona();

      // Get subscription status
      const subscription = await SubscriptionManager.checkSubscription(userId);
      const isSubscribed = await SubscriptionManager.isActive(userId);
      const daysUntilExpiry = await SubscriptionManager.getDaysUntilExpiry(userId);

      // Calculate access flags
      const canAccessFullContent = persona?.persona !== 'reviewer' && isSubscribed;
      const isActivated =
        persona?.persona !== 'organic' ||
        (persona?.activationTime && Date.now() - persona.activationTime > 48 * 60 * 60 * 1000);

      // Calculate activation progress
      let activationProgress = 0;
      if (persona && persona.persona === 'organic' && persona.activationTime) {
        const elapsed = Date.now() - persona.activationTime;
        const totalTime = 48 * 60 * 60 * 1000;
        activationProgress = Math.min(elapsed / totalTime, 1);
      } else if (persona) {
        activationProgress = 1;
      }

      set({
        persona,
        subscription,
        isSubscribed,
        daysUntilExpiry,
        canAccessFullContent,
        needsAdminApproval: persona?.needsAdminApproval || false,
        isActivated: isActivated || false,
        activationProgress,
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

  // Update subscription state
  updateSubscription: async (userId: string) => {
    try {
      const subscription = await SubscriptionManager.checkSubscription(userId);
      const isSubscribed = await SubscriptionManager.isActive(userId);
      const daysUntilExpiry = await SubscriptionManager.getDaysUntilExpiry(userId);

      const persona = get().persona;
      const canAccessFullContent = persona?.persona !== 'reviewer' && isSubscribed;

      set({
        subscription,
        isSubscribed,
        daysUntilExpiry,
        canAccessFullContent,
      });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  // Check if user can access content
  checkAccess: () => {
    const { persona, isSubscribed, isActivated } = get();

    if (!persona) return false;
    if (persona.persona === 'reviewer') return false;
    if (!isSubscribed) return false;
    if (persona.persona === 'organic' && !isActivated) return false;
    if (persona.persona === 'organic' && persona.needsAdminApproval) return false;

    return true;
  },

  // Reset store
  reset: () => {
    set({
      persona: null,
      isLoading: false,
      error: null,
      subscription: null,
      isSubscribed: false,
      daysUntilExpiry: null,
      canAccessFullContent: false,
      needsAdminApproval: false,
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
