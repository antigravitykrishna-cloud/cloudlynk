import { useCallback, useEffect, useState } from 'react';
import type { VideoPlayer } from 'expo-video';
import { playerPrefsApi } from '@/features/player/api/playerPrefsApi';

export const QUALITY_OPTIONS = ['480p', '720p', '1080p'];
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const DEFAULT_QUALITY = '720p';

/**
 * The viewer's preferred speed and quality, loaded from their account and saved when changed.
 * Speed is applied to the player. Quality is only remembered: Cloudflare's HLS stream picks the
 * rendition for the connection by itself.
 */
export function usePlayerPreferences(userId: string | undefined, player: VideoPlayer) {
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!userId) return;
    playerPrefsApi
      .get(userId)
      .then(prefs => {
        if (!prefs) return;
        setQuality(
          QUALITY_OPTIONS.includes(prefs.default_quality) ? prefs.default_quality : DEFAULT_QUALITY,
        );
        setSpeed(prefs.default_speed ?? 1);
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    player.playbackRate = speed;
  }, [player, speed]);

  const changeQuality = useCallback(
    async (value: string) => {
      setQuality(value);
      if (userId) await playerPrefsApi.save(userId, { default_quality: value });
    },
    [userId],
  );

  const changeSpeed = useCallback(
    async (value: number) => {
      setSpeed(value);
      if (userId) await playerPrefsApi.save(userId, { default_speed: value });
    },
    [userId],
  );

  return { quality, speed, changeQuality, changeSpeed };
}
