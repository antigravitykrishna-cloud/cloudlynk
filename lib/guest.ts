import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;
import { showAlert } from '../components/Feedback';

/**
 * A guest account (v89) cannot upload or create channels -- the database
 * refuses it. Say so up front, with the way out, instead of letting the
 * person pick a file and hit a permission error.
 */
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
