import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Colors, Radius, withAlpha } from '@/theme';

/** The progress track. Tap anywhere to jump there, or drag to scrub and release to seek. */
export function SeekBar({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const trackWidth = useRef(0);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);

  const responder = useMemo(() => {
    const ratioAt = (e: GestureResponderEvent) =>
      Math.max(0, Math.min(1, e.nativeEvent.locationX / (trackWidth.current || 1)));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => setScrubRatio(ratioAt(e)),
      onPanResponderMove: e => setScrubRatio(ratioAt(e)),
      onPanResponderRelease: e => {
        if (duration > 0) onSeek(ratioAt(e) * duration);
        setScrubRatio(null);
      },
      onPanResponderTerminate: () => setScrubRatio(null),
    });
  }, [duration, onSeek]);

  const playedRatio = duration > 0 ? (scrubRatio ?? currentTime / duration) : 0;
  const playedPercent = Math.min(100, Math.max(0, playedRatio * 100));

  return (
    <View
      style={styles.track}
      onLayout={e => {
        trackWidth.current = e.nativeEvent.layout.width;
      }}
      {...responder.panHandlers}
    >
      <View style={styles.background}>
        <View style={[styles.fill, { width: `${playedPercent}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Taller than the bar it draws, so it is easy to hit with a thumb.
  track: { flex: 1, height: 28, justifyContent: 'center' },
  background: {
    height: 4,
    borderRadius: Radius.xs,
    backgroundColor: withAlpha(Colors.white, 0.3),
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: Radius.xs, backgroundColor: Colors.brandBlue },
});
