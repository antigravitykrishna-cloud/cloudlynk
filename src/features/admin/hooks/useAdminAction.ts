import { useState } from 'react';
import { showAlert } from '@/components/ui/Feedback';
import { fireHaptic } from '@/components/ui/Press';
import { errorMessage } from '@/utils/errors';

/**
 * Runs admin actions one at a time: shows which one is busy, reloads afterwards so the screen shows
 * what the database now says (never what the button assumed), and reports the outcome.
 */
export function useAdminAction(reload: () => Promise<unknown>) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>, doneMessage: string) {
    setBusy(key);
    try {
      await action();
      fireHaptic('success');
      await reload();
      showAlert('Done', doneMessage);
    } catch (err) {
      fireHaptic('error');
      showAlert('Could not do that', errorMessage(err, 'Please try again.'));
    } finally {
      setBusy(null);
    }
  }

  /** Asks first; `destructive` paints the confirm button red. */
  function confirm(
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void,
    { destructive = true }: { destructive?: boolean } = {},
  ) {
    showAlert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }

  return { busy, run, confirm };
}
