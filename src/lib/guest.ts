import type { useRouter } from 'expo-router';
import { showAlert } from '../components/Feedback';

type Router = ReturnType<typeof useRouter>;

/**
 * A guest account (v89) cannot upload or create channels -- the database
 * refuses it. Say so up front, with the way out, instead of letting the
 * person pick a file and hit a permission error.
 */
/**
 * A guest tapped a title. Guests see previews only (v90), so nothing plays.
 * One who has already paid is not sent to the plans again -- that reads as
 * "you did not pay" -- but to saving the account, which is what unlocks it.
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
