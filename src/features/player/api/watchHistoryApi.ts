import { supabase } from '@/lib/supabase';

/** How far someone got through a video, as saved in `watch_history`. */
export type WatchProgress = {
  positionSeconds: number;
  durationSeconds: number;
  lastWatchedAt: string | null;
};

/** Watched this far (as a share of the duration) counts as finished. */
const COMPLETED_AT = 0.9;

export const watchHistoryApi = {
  async getProgress(userId: string, postId: string): Promise<WatchProgress | null> {
    const { data } = await supabase
      .from('watch_history')
      .select('position_seconds, duration_seconds, last_watched_at')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle();
    if (!data) return null;
    return {
      positionSeconds: data.position_seconds ?? 0,
      durationSeconds: data.duration_seconds ?? 0,
      lastWatchedAt: data.last_watched_at,
    };
  },

  async saveProgress(
    userId: string,
    postId: string,
    positionSeconds: number,
    durationSeconds: number,
  ): Promise<void> {
    const { error } = await supabase.from('watch_history').upsert(
      {
        user_id: userId,
        post_id: postId,
        position_seconds: positionSeconds,
        duration_seconds: durationSeconds,
        completed: positionSeconds >= durationSeconds * COMPLETED_AT,
        last_watched_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,post_id' },
    );
    if (error && __DEV__) console.error('saveProgress:', error.message);
  },
};
