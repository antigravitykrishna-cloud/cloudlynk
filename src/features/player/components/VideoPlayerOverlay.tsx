import { useCallback, useEffect, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useEvent } from 'expo';
import { VideoView, type VideoPlayer } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Radius, Spacing, withAlpha } from '@/theme';
import { formatClock } from '@/utils/format';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { PlayerSettingsPanel } from '@/features/player/components/PlayerSettingsPanel';
import { ResumePrompt } from '@/features/player/components/ResumePrompt';
import { SeekBar } from '@/features/player/components/SeekBar';
import { useDoubleTapSkip } from '@/features/player/hooks/useDoubleTapSkip';
import { usePlayerPreferences } from '@/features/player/hooks/usePlayerPreferences';
import { useResumePosition } from '@/features/player/hooks/useResumePosition';

/**
 * Full-screen player with the app's own controls (native controls are off): close, settings
 * (quality and speed), play/pause, a seek bar, and double-tap on either edge to skip 10 seconds.
 * Rotation is unlocked while it is open.
 */
export function VideoPlayerOverlay({
  player,
  onClose,
  postId,
  postTitle,
}: {
  player: VideoPlayer;
  onClose: () => void;
  postId: string;
  postTitle?: string;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  // Re-render on rotation so the overlay lays out again for landscape.
  useWindowDimensions();

  const [showSettings, setShowSettings] = useState(false);
  const resume = useResumePosition(user?.id, postId);
  const preferences = usePlayerPreferences(user?.id, player);
  const skip = useDoubleTapSkip(player);

  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const duration = player.duration ?? 0;

  // Frequent time updates so the seek bar moves smoothly (the default interval is coarse).
  useEffect(() => {
    player.timeUpdateEventInterval = 0.25;
  }, [player]);

  useEffect(() => {
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      StatusBar.setHidden(false);
    };
  }, []);

  const close = useCallback(async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    StatusBar.setHidden(false);
    onClose();
  }, [onClose]);

  const togglePlayback = useCallback(() => {
    if (player.playing) {
      player.pause();
      return;
    }
    // play() does nothing at the very end of a video, so start again from the top.
    const end = player.duration ?? 0;
    if (end > 0 && (player.currentTime ?? 0) >= end - 0.5) player.currentTime = 0;
    player.play();
  }, [player]);

  const seek = useCallback(
    (seconds: number) => {
      player.currentTime = seconds;
    },
    [player],
  );

  return (
    <View style={[StyleSheet.absoluteFill, styles.container]}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls={false}
        allowsPictureInPicture
      />

      {resume.showPrompt ? (
        <ResumePrompt
          title={postTitle}
          positionSeconds={resume.positionSeconds}
          onResume={() => {
            seek(resume.positionSeconds);
            resume.dismiss();
          }}
          onRestart={() => {
            seek(0);
            player.play();
            resume.dismiss();
          }}
        />
      ) : (
        <>
          {/* Narrow edge strips for double-tap skip; the centre stays free for the controls. */}
          <View style={[styles.edge, styles.edgeLeft]} {...skip.handlers.back} />
          <View style={[styles.edge, styles.edgeRight]} {...skip.handlers.forward} />

          <View style={[styles.topBar, { top: insets.top + Spacing.md }]}>
            <OverlayButton label="✕" accessibilityLabel="Close player" onPress={close} />
            <OverlayButton
              label="⚙"
              accessibilityLabel="Playback settings"
              onPress={() => setShowSettings(shown => !shown)}
            />
          </View>

          {showSettings && (
            <PlayerSettingsPanel
              quality={preferences.quality}
              speed={preferences.speed}
              onQualityChange={preferences.changeQuality}
              onSpeedChange={preferences.changeSpeed}
            />
          )}

          <View style={[styles.controls, { bottom: insets.bottom + Spacing.xl }]}>
            <TouchableOpacity
              onPress={togglePlayback}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            >
              <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
            <Text style={styles.time}>{formatClock(Math.min(currentTime, duration))}</Text>
            <SeekBar currentTime={currentTime} duration={duration} onSeek={seek} />
            <Text style={styles.time}>{formatClock(duration)}</Text>
          </View>
        </>
      )}

      {skip.lastSkip && (
        <View
          style={[styles.skipHint, skip.lastSkip === 'back' ? styles.hintLeft : styles.hintRight]}
          pointerEvents="none"
        >
          <Text style={styles.skipHintText}>{skip.lastSkip === 'back' ? '⏪ 10s' : '10s ⏩'}</Text>
        </View>
      )}
    </View>
  );
}

function OverlayButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.overlayButton}
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={styles.overlayButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.black, zIndex: 100 },
  video: { flex: 1, width: '100%', height: '100%' },

  edge: { position: 'absolute', top: 60, bottom: 120, width: 80, zIndex: 5 },
  edgeLeft: { left: 0 },
  edgeRight: { right: 0 },

  topBar: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
  },
  overlayButton: {
    backgroundColor: withAlpha(Colors.black, 0.7),
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  overlayButtonText: { color: Colors.text, fontSize: FontSize.base, fontWeight: FontWeight.bold },

  controls: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 20,
  },
  playIcon: { color: Colors.text, fontSize: FontSize.title, width: 28, textAlign: 'center' },
  time: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    minWidth: 40,
    textAlign: 'center',
  },

  skipHint: {
    position: 'absolute',
    top: '40%',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: withAlpha(Colors.black, 0.65),
    borderRadius: Radius.xxl,
    zIndex: 50,
  },
  hintLeft: { left: Spacing.xl },
  hintRight: { right: Spacing.xl },
  skipHintText: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.extrabold },
});
