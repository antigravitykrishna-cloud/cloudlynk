/**
 * v0.7.0 Video player overlay.
 * nativeControls=false — ExoPlayer's native bottom row (play/pause, skip, progress, settings)
 * is fully replaced by our own custom bottom row, so there's only ONE settings button (top bar).
 * We add: close button, settings (quality/speed), custom play/pause + progress bar/seek.
 * No tapOverlay blocking anything. Double-tap skip on narrow left/right edge strips only.
 */

import {
  View, TouchableOpacity, Text, StyleSheet, StatusBar,
  Dimensions, PanResponder,
} from 'react-native';
import { VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Colors, Radius, FontSize } from '../constants/theme';
import { useResumePosition, formatPosition } from '../hooks/useResumePosition';
import { useAuth } from '../hooks/useAuth';
import { PlayerPrefsService, PlayerPrefs } from '../lib/services/playerPrefs';

type Props = {
  player: any;
  onClose: () => void;
  postId?: string;
  postTitle?: string;
  isPremium?: boolean;
  nextPostId?: string;
  prevPostId?: string;
  onNavigateToPost?: (postId: string) => void;
};

const QUALITY_OPTIONS = ['480p', '720p', '1080p'];
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const DOUBLE_TAP_MS = 300;

export function VideoPlayerOverlay({ player, onClose, postId, postTitle, isPremium, nextPostId, prevPostId, onNavigateToPost }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id;

  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  const [showSettings, setShowSettings] = useState(false);
  const [showResume, setShowResume] = useState(true);

  const { positionSeconds, showOverlay: shouldShowResume, dismiss: dismissResume } = useResumePosition(userId, postId);

  const [playerPrefs, setPlayerPrefs] = useState<PlayerPrefs | null>(null);
  const [quality, setQuality] = useState('720p');
  const [speed, setSpeed] = useState(1);

  const lastTapRef = useRef<{ time: number } | null>(null);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [skipFeedback, setSkipFeedback] = useState<{ side: 'left' | 'right' } | null>(null);

  useEffect(() => {
    if (!userId) return;
    PlayerPrefsService.get(userId).then(prefs => {
      if (prefs) {
        setPlayerPrefs(prefs);
        const savedQ = prefs.default_quality ?? '720p';
        setQuality(QUALITY_OPTIONS.includes(savedQ) ? savedQ : '720p');
        setSpeed(prefs.default_speed ?? 1);
      }
    }).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (player && player.playbackRate !== undefined) player.playbackRate = speed;
  }, [player, speed]);

  // Faster time updates so the custom progress bar moves smoothly (default interval is coarse).
  useEffect(() => {
    if (player) player.timeUpdateEventInterval = 0.25;
  }, [player]);

  const timeUpdate = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const playingChange = useEvent(player, 'playingChange', { isPlaying: player?.playing ?? false });
  const currentTime = timeUpdate.currentTime;
  const duration = player?.duration ?? 0;
  const isPlaying = playingChange.isPlaying;

  const togglePlayPause = useCallback(() => {
    if (!player) return;
    if (player.playing) {
      player.pause();
    } else {
      // If at end of video (within 0.5s tolerance for timeUpdate drift), restart from 0.
      // expo-video's player.play() has no effect when currentTime is already at duration.
      const dur = player.duration ?? 0;
      const cur = player.currentTime ?? 0;
      if (dur > 0 && cur >= dur - 0.5) {
        player.currentTime = 0;
      }
      player.play();
    }
  }, [player]);

  useEffect(() => {
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      StatusBar.setHidden(false);
    };
  }, []);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDimensions(window));
    return () => sub.remove();
  }, []);

  const handleClose = useCallback(async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    StatusBar.setHidden(false);
    onClose();
  }, [onClose]);

  const handleResume = useCallback(() => {
    if (player && positionSeconds > 0) player.currentTime = positionSeconds;
    dismissResume();
    setShowResume(false);
  }, [player, positionSeconds, dismissResume]);

  const handleRestart = useCallback(() => {
    if (player) {
      player.currentTime = 0;
      player.play();
    }
    dismissResume();
    setShowResume(false);
  }, [player, dismissResume]);

  const handleQualityChange = useCallback(async (q: string) => {
    setQuality(q);
    if (userId) await PlayerPrefsService.upsert(userId, { default_quality: q });
  }, [userId]);

  const handleSpeedChange = useCallback(async (s: number) => {
    setSpeed(s);
    if (userId) await PlayerPrefsService.upsert(userId, { default_speed: s });
  }, [userId]);

  // Left edge strip — double-tap = -10s
  const leftPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => false,
    onPanResponderGrant: () => {
      const now = Date.now();
      const last = lastTapRef.current;
      if (last && now - last.time < DOUBLE_TAP_MS) {
        lastTapRef.current = null;
        if (player) player.currentTime = Math.max(0, (player.currentTime ?? 0) - 10);
        if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
        setSkipFeedback({ side: 'left' });
        skipTimerRef.current = setTimeout(() => setSkipFeedback(null), 700);
      } else {
        lastTapRef.current = { time: now };
      }
    },
  }), [player]);

  // Right edge strip — double-tap = +10s
  const rightPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => false,
    onPanResponderGrant: () => {
      const now = Date.now();
      const last = lastTapRef.current;
      if (last && now - last.time < DOUBLE_TAP_MS) {
        lastTapRef.current = null;
        if (player) player.currentTime = (player.currentTime ?? 0) + 10;
        if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
        setSkipFeedback({ side: 'right' });
        skipTimerRef.current = setTimeout(() => setSkipFeedback(null), 700);
      } else {
        lastTapRef.current = { time: now };
      }
    },
  }), [player]);

  // Custom progress bar — tap or drag anywhere on the track to seek
  const trackWidthRef = useRef(0);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const progressPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const width = trackWidthRef.current || 1;
      setScrubRatio(Math.max(0, Math.min(1, e.nativeEvent.locationX / width)));
    },
    onPanResponderMove: (e) => {
      const width = trackWidthRef.current || 1;
      setScrubRatio(Math.max(0, Math.min(1, e.nativeEvent.locationX / width)));
    },
    onPanResponderRelease: (e) => {
      const width = trackWidthRef.current || 1;
      const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / width));
      if (player && duration > 0) player.currentTime = ratio * duration;
      setScrubRatio(null);
    },
    onPanResponderTerminate: () => setScrubRatio(null),
  }), [player, duration]);

  const showResumeOverlay = shouldShowResume && showResume;

  return (
    <View style={[StyleSheet.absoluteFill, styles.container]}>

      {/* Video fills everything — native controls disabled, custom bottom row owns playback UI */}
      <VideoView
        player={player}
        style={styles.video}
        nativeControls={false}
        allowsPictureInPicture
      />

      {/* Left/right edge strips for double-tap skip only — 80px wide, don't cover center */}
      {!showResumeOverlay && <View style={styles.leftStrip}  {...leftPan.panHandlers} />}
      {!showResumeOverlay && <View style={styles.rightStrip} {...rightPan.panHandlers} />}

      {/* Resume overlay */}
      {showResumeOverlay && (
        <View style={styles.resumeOverlay} pointerEvents="box-none">
          <View style={styles.resumeCard}>
            {postTitle && <Text style={styles.resumeTitle} numberOfLines={1}>{postTitle}</Text>}
            <Text style={styles.resumePosition}>Resume from {formatPosition(positionSeconds)}</Text>
            <View style={styles.resumeActions}>
              <TouchableOpacity style={styles.resumeBtn} onPress={handleResume} activeOpacity={0.8}>
                <Text style={styles.resumeBtnTxt}>▶ Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.restartBtn} onPress={handleRestart} activeOpacity={0.7}>
                <Text style={styles.restartBtnTxt}>Restart</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Top bar — always visible, high zIndex so always above video */}
      {!showResumeOverlay && (
        <View style={[styles.topBar, { top: insets.top + 12 }]}>
          <TouchableOpacity style={styles.btn} onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.btnText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.topRight}>
            {postId && (
              <TouchableOpacity style={styles.btn} onPress={() => setShowSettings(s => !s)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.btnText}>⚙</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Episode navigation */}
      {!showResumeOverlay && !showSettings && (nextPostId || prevPostId) && onNavigateToPost && (
        <View style={styles.episodeNav}>
          {prevPostId ? (
            <TouchableOpacity style={styles.episodeBtn} onPress={() => onNavigateToPost(prevPostId)} activeOpacity={0.7}>
              <Text style={styles.episodeBtnTxt}>← Prev</Text>
            </TouchableOpacity>
          ) : <View style={{ flex: 1 }} />}
          {nextPostId ? (
            <TouchableOpacity style={styles.episodeBtn} onPress={() => onNavigateToPost(nextPostId)} activeOpacity={0.7}>
              <Text style={styles.episodeBtnTxt}>Next →</Text>
            </TouchableOpacity>
          ) : <View style={{ flex: 1 }} />}
        </View>
      )}

      {/* Settings panel */}
      {showSettings && !showResumeOverlay && (
        <View style={styles.settingsPanel}>
          <View style={styles.compactRow}>
            <Text style={styles.compactLabel}>Quality</Text>
            {QUALITY_OPTIONS.map(q => (
              <TouchableOpacity key={q} style={[styles.compactChip, quality === q && styles.compactChipActive]} onPress={() => handleQualityChange(q)} activeOpacity={0.7}>
                <Text style={[styles.compactChipTxt, quality === q && styles.compactChipTxtActive]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.compactRow}>
            <Text style={styles.compactLabel}>Speed</Text>
            {SPEED_OPTIONS.map(s => (
              <TouchableOpacity key={s} style={[styles.compactChip, speed === s && styles.compactChipActive]} onPress={() => handleSpeedChange(s)} activeOpacity={0.7}>
                <Text style={[styles.compactChipTxt, speed === s && styles.compactChipTxtActive]}>{s === 1 ? '1×' : `${s}×`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Custom bottom row — play/pause, time, draggable progress bar (native row removed) */}
      {!showResumeOverlay && (
        <View style={[styles.bottomRow, { bottom: insets.bottom + 20 }]}>
          <TouchableOpacity onPress={togglePlayPause} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>

          <Text style={styles.timeText}>{formatPosition(Math.min(currentTime, duration))}</Text>

          <View
            style={styles.progressTrack}
            onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
            {...progressPan.panHandlers}
          >
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.max(0, duration > 0 ? (scrubRatio ?? currentTime / duration) * 100 : 0))}%` },
                ]}
              />
            </View>
          </View>

          <Text style={styles.timeText}>{formatPosition(duration)}</Text>
        </View>
      )}

      {/* Skip feedback */}
      {skipFeedback && (
        <View style={[styles.skipFeedback, skipFeedback.side === 'left' ? styles.skipLeft : styles.skipRight]} pointerEvents="none">
          <Text style={styles.skipTxt}>{skipFeedback.side === 'left' ? '⏪ 10s' : '10s ⏩'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#000', zIndex: 100 },
  video: { flex: 1, width: '100%', height: '100%' },

  // 80px edge strips — only for double-tap skip, don't block center or native controls
  leftStrip:  { position: 'absolute', top: 60, left: 0,  width: 80, bottom: 120, zIndex: 5 },
  rightStrip: { position: 'absolute', top: 60, right: 0, width: 80, bottom: 120, zIndex: 5 },

  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 20 },
  topRight: { flexDirection: 'row', gap: 8 },
  btn: { backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  resumeOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 80, zIndex: 30 },
  resumeCard: { width: '85%', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  resumeTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  resumePosition: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.accentOrange, marginBottom: 20 },
  resumeActions: { flexDirection: 'row', gap: 12, width: '100%' },
  resumeBtn: { flex: 1, backgroundColor: Colors.brand, borderRadius: Radius.sm, paddingVertical: 12, alignItems: 'center' },
  resumeBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  restartBtn: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  restartBtnTxt: { color: Colors.textSecondary, fontSize: 15, fontWeight: '700' },

  episodeNav: { position: 'absolute', bottom: 110, left: 16, right: 16, flexDirection: 'row', zIndex: 20 },
  episodeBtn: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginHorizontal: 4 },
  episodeBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  settingsPanel: { position: 'absolute', bottom: 130, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.92)', paddingHorizontal: 16, paddingVertical: 10, zIndex: 35 },
  compactRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  compactLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1, marginRight: 4, minWidth: 44 },
  compactChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border },
  compactChipActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  compactChipTxt: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  compactChipTxtActive: { color: '#ffffff' },

  bottomRow: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 20 },
  playIcon: { color: '#fff', fontSize: 20, width: 28, textAlign: 'center' },
  timeText: { color: '#fff', fontSize: 12, fontWeight: '700', minWidth: 40, textAlign: 'center' },
  progressTrack: { flex: 1, height: 28, justifyContent: 'center' },
  progressBg: { height: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 4, backgroundColor: Colors.brand },

  skipFeedback: { position: 'absolute', top: '40%', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 24, zIndex: 50 },
  skipLeft: { left: 20 },
  skipRight: { right: 20 },
  skipTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
