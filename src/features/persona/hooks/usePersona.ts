/**
 * Persona Hook
 * Integrates persona detection with existing auth system
 * Wraps PersonaStore for use throughout the app
 */

import { useEffect, useState } from 'react';
import { usePersonaStore } from '@/lib/stores/personaStore';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { NotificationManager } from '@/features/persona/api/NotificationManager';
import { recordCurrentDevice } from '@/features/persona/api/deviceApi';
import { wipeOnCompromise } from '@/lib/security/antiRE';

export function usePersona() {
  const { user } = useAuth();
  const personaStore = usePersonaStore();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializePersona = async () => {
      if (!user?.id) {
        personaStore.reset();
        setIsInitialized(true);
        return;
      }

      try {
        // Check for compromise before initializing (disabled for now - causing errors)
        // await wipeOnCompromise();

        // Initialize persona detection
        await personaStore.initializePersona(user.id);

        // Initialize notifications
        await NotificationManager.initialize();

        // Record this device for the admin approvals view; never blocks sign-in.
        try {
          await recordCurrentDevice();
        } catch (deviceError) {
          if (__DEV__) console.warn('Failed to record device:', deviceError);
        }

        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize persona:', error);
        setIsInitialized(true); // Continue anyway with safe defaults
      }
    };

    initializePersona();
  }, [user?.id]);

  // Refresh persona periodically (every 30 mins)
  useEffect(() => {
    if (!user?.id || !isInitialized) return;

    const interval = setInterval(
      () => {
        personaStore.refreshPersona(user.id);
      },
      30 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [user?.id, isInitialized]);

  return {
    ...personaStore,
    isReady: isInitialized && personaStore.persona !== null,
  };
}
