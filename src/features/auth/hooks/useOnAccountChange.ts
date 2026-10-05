import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';

/**
 * Runs `reset` when a different account signs in or out, so a screen never shows the previous
 * account's data while it reloads. Not on first mount (the initial sign-in is not a change).
 */
export function useOnAccountChange(reset: () => void) {
  const { user } = useAuth();
  const userId = user?.id;
  const previous = useRef<string | undefined>(undefined);
  const latestReset = useRef(reset);
  latestReset.current = reset;

  useEffect(() => {
    if (previous.current !== undefined && previous.current !== userId) latestReset.current();
    previous.current = userId;
  }, [userId]);
}
