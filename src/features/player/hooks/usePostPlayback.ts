import { useCallback, useEffect, useState } from 'react';
import { useEvent } from 'expo';
import { useVideoPlayer } from 'expo-video';
import { publicMedia } from '@/lib/publicMedia';
import { playbackApi } from '@/features/player/api/playbackApi';
import { watchHistoryApi } from '@/features/player/api/watchHistoryApi';
import { useWatchProgress } from '@/features/player/hooks/useWatchProgress';
import type { ChannelPost } from '@/features/content/model';

type PlayablePost = Pick<ChannelPost, 'id' | 'video_url' | 'media_url' | 'media_type'>;

/**
 * Everything a post's detail view needs to play its video: fetches the signed URL, creates the
 * player, starts where the viewer left off, and saves progress while it plays.
 */
export function usePostPlayback(post: PlayablePost | null, userId: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const postId = post?.id;
  const streamUid = post?.video_url ?? null;
  // Older posts may carry a video uploaded straight to public media instead of Stream.
  const mediaVideo = post?.media_type === 'video' ? (post.media_url ?? null) : null;
  const hasVideo = !!streamUid || !!mediaVideo;

  // A different post: stop, and resolve its URL.
  useEffect(() => {
    setIsPlaying(false);
    setError(null);
    setUrl(null);
    setLoading(!!streamUid);
    if (!postId) return;

    if (mediaVideo && !streamUid) {
      setUrl(publicMedia.url(mediaVideo));
      return;
    }
    if (!streamUid) return;

    let cancelled = false;
    playbackApi
      .getPlaybackUrl(postId)
      .then(signedUrl => !cancelled && setUrl(signedUrl))
      .catch(err => !cancelled && setError(err?.message ?? "This video isn't available."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [postId, streamUid, mediaVideo]);

  const player = useVideoPlayer(url, p => {
    p.loop = false;
    p.timeUpdateEventInterval = 5;
  });

  const { updatePosition, saveProgress } = useWatchProgress(userId, postId, isPlaying);
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });

  useEffect(() => {
    if (currentTime > 0) updatePosition(currentTime, player.duration);
  }, [currentTime, player.duration, updatePosition]);

  // Start from where the viewer left off. The player overlay also offers "Restart".
  useEffect(() => {
    if (!postId || !userId) return;
    watchHistoryApi
      .getProgress(userId, postId)
      .then(progress => {
        if (progress && progress.positionSeconds > 0) {
          player.currentTime = progress.positionSeconds;
        }
      })
      .catch(() => {});
  }, [postId, userId, player]);

  useEffect(() => {
    if (isPlaying) {
      player.play();
    } else {
      player.pause();
      saveProgress();
    }
  }, [isPlaying, player, saveProgress]);

  const play = useCallback(() => {
    if (url) setIsPlaying(true);
  }, [url]);
  const stop = useCallback(() => setIsPlaying(false), []);

  return { player, hasVideo, loading, error, ready: !!url, isPlaying, play, stop };
}
