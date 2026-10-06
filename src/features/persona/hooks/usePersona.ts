/**
 * Persona Hook
 * Integrates persona detection with existing auth system
 * Wraps PersonaStore for use throughout the app
 */

import { useEffect, useState } from 'react';
import { usePersonaStore } from '@/lib/stores/personaStore';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { NotificationManager } from '@/notifications/NotificationManager';

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
        // Initialize persona detection
        await personaStore.initializePersona(user.id);

        // Initialize notifications
        await NotificationManager.initialize();

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

    const interval = setInterval(() => {
      personaStore.refreshPersona(user.id);
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user?.id, isInitialized]);

  return {
    ...personaStore,
    isReady: isInitialized && personaStore.persona !== null,
  };
}
