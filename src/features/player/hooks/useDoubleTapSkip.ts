import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';
import type { VideoPlayer } from 'expo-video';

const DOUBLE_TAP_MS = 300;
const SKIP_SECONDS = 10;
const FEEDBACK_MS = 700;

export type SkipSide = 'back' | 'forward';

/**
 * Double-tap the left edge to go back 10 s, the right edge to go forward 10 s. Returns the touch
 * handlers for each edge and which way the last skip went (for a brief on-screen hint).
 */
export function useDoubleTapSkip(player: VideoPlayer) {
  const lastTapAt = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSkip, setLastSkip] = useState<SkipSide | null>(null);

  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const handlers = useMemo(() => {
    const edge = (side: SkipSide): GestureResponderHandlers =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => false,
        onPanResponderGrant: () => {
          const now = Date.now();
          if (now - lastTapAt.current >= DOUBLE_TAP_MS) {
            lastTapAt.current = now;
            return;
          }
          lastTapAt.current = 0;
          const delta = side === 'back' ? -SKIP_SECONDS : SKIP_SECONDS;
          player.currentTime = Math.max(0, (player.currentTime ?? 0) + delta);

          if (hintTimer.current) clearTimeout(hintTimer.current);
          setLastSkip(side);
          hintTimer.current = setTimeout(() => setLastSkip(null), FEEDBACK_MS);
        },
      }).panHandlers;

    return { back: edge('back'), forward: edge('forward') };
  }, [player]);

  return { handlers, lastSkip };
}
