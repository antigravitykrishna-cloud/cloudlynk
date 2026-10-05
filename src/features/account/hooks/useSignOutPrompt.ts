import { useRouter } from 'expo-router';
import { showAlert } from '@/components/ui/Feedback';
import { useAuth } from '@/features/auth/hooks/useAuth';

/**
 * Asks before signing out. A guest ID gets a stronger warning: it cannot be signed back into, so
 * signing out loses the account (and any plan on it) for good, unless it is saved first.
 */
export function useSignOutPrompt() {
  const router = useRouter();
  const { isGuest, signOut } = useAuth();

  return () => {
    if (isGuest) {
      showAlert(
        'You will lose this guest account',
        'Guest accounts cannot be signed back into. Anything on it, including a plan, will be lost. Save your account first.',
        [
          { text: 'Save account', style: 'cancel', onPress: () => router.push('/save-account') },
          { text: 'Sign out anyway', style: 'destructive', onPress: signOut },
        ],
      );
      return;
    }
    showAlert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };
}
