import type { WatchProgress } from '@/features/player/api/watchHistoryApi';

const MAX_THRESHOLD_SECONDS = 30;
const SHORT_VIDEO_THRESHOLD_SHARE = 0.3;
const NEARLY_FINISHED_SHARE = 0.9;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whether to offer "Resume from 12:34" when a video opens. Only when the person got far enough in
 * to care (30 s, or 30% of a short video), had not nearly finished, and watched it in the last week.
 */
export function shouldOfferResume(
  progress: WatchProgress | null,
  now: number = Date.now(),
): boolean {
  if (!progress) return false;
  const { positionSeconds: position, durationSeconds: duration, lastWatchedAt } = progress;

  // For a 32 s clip the prompt appears from ~10 s; for anything over 100 s, from 30 s.
  const threshold =
    duration > 0
      ? Math.min(MAX_THRESHOLD_SECONDS, duration * SHORT_VIDEO_THRESHOLD_SHARE)
      : MAX_THRESHOLD_SECONDS;
  if (position < threshold) return false;
  if (duration > 0 && position >= duration * NEARLY_FINISHED_SHARE) return false;

  const age = now - new Date(lastWatchedAt ?? 0).getTime();
  return age <= MAX_AGE_MS;
}
