import { useCallback, useEffect, useRef } from 'react';
import { watchHistoryApi } from '@/features/player/api/watchHistoryApi';

const SAVE_EVERY_MS = 10_000;

/**
 * Saves how far the viewer got: every 10 seconds while playing, and once more when playback stops
 * or the post closes. Feed it positions with `updatePosition`.
 */
export function useWatchProgress(
  userId: string | undefined,
  postId: string | undefined,
  isPlaying: boolean,
) {
  const positionRef = useRef(0);
  const durationRef = useRef(0);

  const updatePosition = useCallback((positionSeconds: number, durationSeconds: number) => {
    positionRef.current = Math.round(positionSeconds);
    durationRef.current = Math.round(durationSeconds);
  }, []);

  const saveProgress = useCallback(async () => {
    const position = positionRef.current;
    const duration = durationRef.current;
    if (!userId || !postId || duration <= 0 || position <= 0) return;
    await watchHistoryApi.saveProgress(userId, postId, position, duration);
  }, [userId, postId]);

  useEffect(() => {
    if (!isPlaying || !userId || !postId) return;
    const timer = setInterval(saveProgress, SAVE_EVERY_MS);
    return () => clearInterval(timer);
  }, [isPlaying, userId, postId, saveProgress]);

  // A final save when the post changes or the screen goes away.
  useEffect(() => () => void saveProgress(), [saveProgress]);

  return { updatePosition, saveProgress };
}
