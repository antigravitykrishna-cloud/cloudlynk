import type { useRouter } from 'expo-router';
import { showAlert } from '@/components/ui/Feedback';

type Router = ReturnType<typeof useRouter>;

/**
 * A guest tapped a title. Guests see previews only. One who already has a plan is sent to save the
 * account (which unlocks watching), not back to the plans.
 */
export function guestTappedTitle(router: Router, hasPlan: boolean) {
  if (hasPlan) {
    showAlert(
      'Save your account to watch',
      'Your plan is active. Save your account with Google or email and everything unlocks right away.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Save account', onPress: () => router.push('/save-account' as never) },
      ],
    );
    return;
  }
  router.push('/premium');
}

/** Guests cannot upload, create channels or join -- say so up front, with the way out. */
export function promptSaveAccount(router: Router, what = 'upload') {
  showAlert(
    'Save your account first',
    `Guest accounts can't ${what}. Save your account with Google or email -- it takes a moment and keeps everything you have.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Save account', onPress: () => router.push('/save-account' as never) },
    ],
  );
}
