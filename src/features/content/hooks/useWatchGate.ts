import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { guestTappedTitle } from '@/features/auth/guestPrompts';
import type { AccessLevel } from '@/features/content/model';
import { watchDecision } from '@/features/content/watchAccess';

/**
 * Returns `mayWatch(post)`: true when the title can open, otherwise it routes the person to what
 * unlocks it (saving a guest account, or the plans) and returns false.
 */
export function useWatchGate() {
  const router = useRouter();
  const { user, isGuest, isPaidUser, isAdmin } = useAuth();
  const signedIn = !!user;

  return useCallback(
    (post: { access_level: AccessLevel }, { isOwner = false }: { isOwner?: boolean } = {}) => {
      const decision = watchDecision(post, { signedIn, isGuest, isPaidUser, isAdmin, isOwner });
      if (decision === 'guest') guestTappedTitle(router, signedIn && isPaidUser);
      if (decision === 'plans') router.push('/premium');
      return decision === 'play';
    },
    [router, signedIn, isGuest, isPaidUser, isAdmin],
  );
}
