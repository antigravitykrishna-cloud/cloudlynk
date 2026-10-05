/**
 * v0.7.0 Resume position hook.
 * Reads saved watch position and decides whether to show the "Resume from MM:SS" overlay.
 * Rules: position must be >= 30s, < 90% complete, updated within last 7 days.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

type ResumeState = {
  positionSeconds: number;
  durationSeconds: number;
  showOverlay: boolean;
  dismiss: () => void;
};

const RESUME_THRESHOLD_CAP_SECONDS = 30; // upper cap for the relative threshold below
const RESUME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function useResumePosition(
  userId: string | undefined,
  postId: string | undefined,
): ResumeState {
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (!userId || !postId) return;

    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase
          .from('watch_history')
          .select('position_seconds, duration_seconds, last_watched_at')
          .eq('user_id', userId)
          .eq('post_id', postId)
          .maybeSingle();

        if (cancelled || !data) return;

        const pos = data.position_seconds ?? 0;
        const dur = data.duration_seconds ?? 0;
        const age = Date.now() - new Date(data.last_watched_at ?? 0).getTime();

        // Skip if position is too short, nearly complete, or too old.
        // Threshold is duration-relative: 30s cap, or 30% of duration, whichever is smaller.
        // For 32s video: threshold = 9.6s (overlay fires at 10s+).
        // For 5min+ video: threshold = 30s (original behavior preserved).
        const threshold = dur > 0 ? Math.min(RESUME_THRESHOLD_CAP_SECONDS, dur * 0.3) : RESUME_THRESHOLD_CAP_SECONDS;
        if (pos < threshold) return;
        if (dur > 0 && pos >= dur * 0.9) return;
        if (age > RESUME_MAX_AGE_MS) return;

        setPositionSeconds(pos);
        setDurationSeconds(dur);
        setShowOverlay(true);
      } catch {
        // Non-critical — silently skip resume prompt on fetch error
      }
    })();

    return () => { cancelled = true; };
  }, [userId, postId]);

  const dismiss = useCallback(() => setShowOverlay(false), []);

  return { positionSeconds, durationSeconds, showOverlay, dismiss };
}

/** Format seconds to MM:SS or H:MM:SS. Clamps negatives defensively. */
export function formatPosition(totalSeconds: number): string {
  const t = Math.max(0, totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
