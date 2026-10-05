import { useCallback, useEffect, useState } from 'react';
import { watchHistoryApi } from '@/features/player/api/watchHistoryApi';
import { shouldOfferResume } from '@/features/player/resume';

/** Whether to show the "Resume from 12:34" prompt for this post, and from where. */
export function useResumePosition(userId: string | undefined, postId: string | undefined) {
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!userId || !postId) return;
    let cancelled = false;

    watchHistoryApi
      .getProgress(userId, postId)
      .then(progress => {
        if (cancelled || !progress || !shouldOfferResume(progress)) return;
        setPositionSeconds(progress.positionSeconds);
        setShowPrompt(true);
      })
      // Not worth interrupting playback for: the video simply starts without the prompt.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [userId, postId]);

  const dismiss = useCallback(() => setShowPrompt(false), []);

  return { positionSeconds, showPrompt, dismiss };
}
