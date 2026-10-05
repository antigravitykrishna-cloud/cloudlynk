import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ChannelPost } from '../lib/posts';

export type WatchHistoryEntry = {
  id: string;
  user_id: string;
  post_id: string;
  position_seconds: number;
  duration_seconds: number;
  completed: boolean;
  last_watched_at: string;
  post: ChannelPost;
};

export function useContinueWatching(userId: string | undefined) {
  const [items, setItems] = useState<WatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setItems([]); setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('watch_history')
        .select(`
          id, user_id, post_id, position_seconds, duration_seconds, completed, last_watched_at,
          post:channel_posts!watch_history_post_id_fkey(
            id, channel_id, author_id, title, body, media_url, media_type, thumbnail_url,
            content_type, genre, duration_min, season_number, episode_number, episode_title,
            release_year, tags, status, video_url, submitted_at, series_id, approved_by,
            approved_at, rejection_note, created_at
          )
        `)
        .eq('user_id', userId)
        .eq('completed', false)
        .order('last_watched_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const entries: WatchHistoryEntry[] = (data ?? [])
        .filter((d): d is typeof d & { post: ChannelPost } => d.post != null)
        .map(d => ({ ...d, post: d.post as unknown as ChannelPost }));

      setItems(entries);
    } catch (err) {
      if (__DEV__) console.error('useContinueWatching:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, refresh: load };
}

export function useRecordProgress(
  userId: string | undefined,
  postId: string | undefined,
  isPlaying: boolean,
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const positionRef = useRef(0);
  const durationRef = useRef(0);

  const updatePosition = useCallback((positionSec: number, durationSec: number) => {
    positionRef.current = Math.round(positionSec);
    durationRef.current = Math.round(durationSec);
  }, []);

  const saveProgress = useCallback(async () => {
    if (!userId || !postId) return;
    const position = positionRef.current;
    const duration = durationRef.current;
    if (duration <= 0 || position <= 0) return;

    const completed = position >= duration * 0.9;

    const { error } = await supabase
      .from('watch_history')
      .upsert(
        {
          user_id: userId,
          post_id: postId,
          position_seconds: position,
          duration_seconds: duration,
          completed,
          last_watched_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,post_id' }
      );

    if (error && __DEV__) console.error('saveProgress:', error.message);
  }, [userId, postId]);

  useEffect(() => {
    if (isPlaying && userId && postId) {
      intervalRef.current = setInterval(saveProgress, 10000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, userId, postId, saveProgress]);

  useEffect(() => {
    return () => { saveProgress(); };
  }, [saveProgress]);

  return { updatePosition, saveProgress };
}

export async function getSavedPosition(
  userId: string | undefined,
  postId: string | undefined,
): Promise<number> {
  if (!userId || !postId) return 0;
  const { data } = await supabase
    .from('watch_history')
    .select('position_seconds')
    .eq('user_id', userId)
    .eq('post_id', postId)
    .maybeSingle();
  return data?.position_seconds ?? 0;
}
