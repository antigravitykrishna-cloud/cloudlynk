import { VideoPlayerOverlay } from '@/features/player/components/VideoPlayerOverlay';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/components/ui/Feedback';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useRecordProgress, getSavedPosition } from '@/features/player/hooks/useWatchHistory';
import { ChannelService, BlockService, ReportService } from '@/features/channels/api/channelsApi';
import { PostService, ChannelPost } from '@/features/content/api/postsApi';
import { StreamService } from '@/features/player/api/streamApi';
import { useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { Colors } from '@/theme';
import { Icon } from '@/components/ui/Icon';
import { H, getTypeColor } from '@/features/channels/components/contentTypeColors';
import { formatMinutes, formatTimeAgo } from '@/utils/format';

// ── Detail modal as standalone
export const DetailModal = memo(
  ({
    selected,
    onClose,
    userId,
    channelId,
  }: {
    selected: ChannelPost | null;
    onClose: () => void;
    userId: string | undefined;
    channelId: string | undefined;
  }) => {
    const insets = useSafeAreaInsets();
    const [isPlaying, setIsPlaying] = useState(false);
    // Premium videos need a server-minted signed URL (see lib/stream.ts).
    // Free videos resolve synchronously with no extra network call.
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoLoading, setVideoLoading] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);

    const handleReport = () => {
      if (!selected || !userId || !channelId) return;
      const submit = (reason: string) => {
        ChannelService.reportContent(channelId, userId, reason, {
          postId: selected.id,
          reportedUserId: selected.author_id,
        })
          .then(() => showAlert('Reported', 'Thanks — our team will review this.'))
          .catch((err: any) => showAlert('Error', err.message ?? 'Could not submit report.'));
      };
      showAlert('Report this content', 'Why are you reporting it?', [
        { text: 'Inappropriate content', onPress: () => submit('inappropriate_content') },
        { text: 'Copyright violation', onPress: () => submit('copyright_violation') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    };

    const handleBlock = () => {
      if (!selected?.author_id || !userId) return;
      if (selected.author_id === userId) return;
      showAlert(
        'Block this uploader?',
        `You won't see content from ${selected.author?.full_name ?? 'this user'} anymore.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () => {
              BlockService.blockUser(userId, selected.author_id)
                .then(() => {
                  showAlert('Blocked');
                  onClose();
                })
                .catch((err: any) => showAlert('Error', err.message ?? 'Could not block user.'));
            },
          },
        ],
      );
    };

    // Distinct from "Report content" — this flags the uploader's account/
    // behavior generally (spam, harassment, impersonation, etc.), not this one
    // upload specifically. See ReportService.reportUser in lib/channels.ts.
    const handleReportUser = () => {
      if (!selected?.author_id || !userId) return;
      if (selected.author_id === userId) return;
      const submit = (reason: string) => {
        ReportService.reportUser(userId, selected.author_id, reason)
          .then(() => showAlert('Reported', 'Thanks — our team will review this account.'))
          .catch((err: any) => showAlert('Error', err.message ?? 'Could not submit report.'));
      };
      showAlert(
        `Report ${selected.author?.full_name ?? 'this user'}`,
        'Why are you reporting this account?',
        [
          { text: 'Harassment or bullying', onPress: () => submit('harassment') },
          { text: 'Spam or scam account', onPress: () => submit('spam') },
          { text: 'Impersonation', onPress: () => submit('impersonation') },
          { text: 'Hate speech', onPress: () => submit('hate_speech') },
          { text: 'Other', onPress: () => submit('other') },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    };

    const handleMore = () => {
      showAlert('More options', undefined, [
        { text: 'Report content', onPress: handleReport },
        { text: 'Report user', onPress: handleReportUser },
        { text: 'Block uploader', style: 'destructive', onPress: handleBlock },
        { text: 'Cancel', style: 'cancel' },
      ]);
    };

    useEffect(() => {
      let cancelled = false;
      setVideoError(null);
      if (!selected?.video_url) {
        setVideoUrl(null);
        return;
      }
      if (selected.access_level === 'premium') {
        setVideoUrl(null);
        setVideoLoading(true);
        StreamService.getSignedPlaybackUrl(selected.id)
          .then(url => {
            if (!cancelled) setVideoUrl(url);
          })
          .catch((err: any) => {
            if (!cancelled) setVideoError(err?.message ?? "This video isn't available.");
          })
          .finally(() => {
            if (!cancelled) setVideoLoading(false);
          });
      } else {
        // Free playback is async now. Videos are created locked, so a free
        // post whose unlock did not land needs the signed-token fallback rather
        // than a plain URL that 403s. The common case still resolves without a
        // round trip — see StreamService.resolveFreePlaybackUrl.
        setVideoLoading(true);
        StreamService.resolveFreePlaybackUrl(selected.id, selected.video_url)
          .then(url => {
            if (!cancelled) setVideoUrl(url);
          })
          .catch((err: any) => {
            if (!cancelled) setVideoError(err?.message ?? "This video isn't available.");
          })
          .finally(() => {
            if (!cancelled) setVideoLoading(false);
          });
      }
      return () => {
        cancelled = true;
      };
    }, [selected?.id, selected?.video_url, selected?.access_level]);

    const player = useVideoPlayer(videoUrl, p => {
      p.loop = false;
      p.timeUpdateEventInterval = 5;
    });

    const { updatePosition, saveProgress } = useRecordProgress(userId, selected?.id, isPlaying);

    const timeUpdate = useEvent(player, 'timeUpdate', {
      currentTime: 0,
      currentLiveTimestamp: null,
      currentOffsetFromLive: null,
      bufferedPosition: 0,
    });
    useEffect(() => {
      if (timeUpdate.currentTime > 0) {
        updatePosition(timeUpdate.currentTime, player.duration);
      }
    }, [timeUpdate.currentTime, player.duration, updatePosition]);

    useEffect(() => {
      if (!selected?.id || !userId) return;
      getSavedPosition(userId, selected.id).then(pos => {
        if (pos > 0) player.currentTime = pos;
      });
    }, [selected?.id, userId, player]);

    useEffect(() => {
      setIsPlaying(false);
    }, [selected]);

    useEffect(() => {
      if (isPlaying) {
        player.play();
      } else {
        player.pause();
        saveProgress();
      }
    }, [isPlaying, player, saveProgress]);

    if (!selected) return null;
    const thumb = selected.thumbnail_url
      ? PostService.getMediaPublicUrl(selected.thumbnail_url)
      : null;
    const hasVideo = !!selected.video_url;

    const handlePlay = async () => {
      if (!selected.video_url) return;
      if (videoError) {
        showAlert('Cannot play', videoError);
        return;
      }
      if (selected.access_level === 'premium' && !videoUrl) return; // still fetching the signed URL
      setIsPlaying(true);
    };

    return (
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={styles.detailModal}>
          <View style={styles.detailHero}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.detailHeroImg} resizeMode="cover" />
            ) : (
              <View style={[styles.detailHeroImg, styles.detailHeroPlaceholder]}>
                <Icon name="film" size={64} color={Colors.textMuted} />
              </View>
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.95)']}
              style={StyleSheet.absoluteFill}
            />
            <TouchableOpacity
              style={[styles.detailClose, { top: insets.top + 12, right: 62 }]}
              onPress={handleMore}
            >
              <Text style={styles.detailCloseTxt}>{'⋯'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.detailClose, { top: insets.top + 12 }]}
              onPress={onClose}
            >
              <Text style={styles.detailCloseTxt}>{'✕'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
            <View style={styles.detailBadgeRow}>
              <View
                style={[
                  styles.detailBadge,
                  {
                    backgroundColor: getTypeColor(selected.content_type) + '33',
                    borderColor: getTypeColor(selected.content_type) + '88',
                  },
                ]}
              >
                <Text
                  style={[styles.detailBadgeTxt, { color: getTypeColor(selected.content_type) }]}
                >
                  {selected.content_type.toUpperCase()}
                </Text>
              </View>
              {!!selected.genre && (
                <View style={styles.detailBadge}>
                  <Text style={styles.detailBadgeTxt}>{selected.genre}</Text>
                </View>
              )}
              {!!selected.release_year && (
                <View style={styles.detailBadge}>
                  <Text style={styles.detailBadgeTxt}>{selected.release_year}</Text>
                </View>
              )}
              {!!selected.duration_min && (
                <View style={styles.detailBadge}>
                  <Text style={styles.detailBadgeTxt}>{formatMinutes(selected.duration_min)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.detailTitle}>{selected.title ?? 'Untitled'}</Text>
            {selected.content_type === 'series' && selected.season_number && (
              <Text style={styles.detailEpisode}>
                Season {selected.season_number} · Episode {selected.episode_number}
                {selected.episode_title ? ` — ${selected.episode_title}` : ''}
              </Text>
            )}
            {!!selected.body && <Text style={styles.detailDesc}>{selected.body}</Text>}
            <View style={styles.detailAuthorRow}>
              <View style={styles.detailAvatar}>
                <Text style={styles.detailAvatarTxt}>
                  {(selected.author?.full_name ?? 'U')
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.detailAuthorName}>
                  {selected.author?.full_name ?? 'Unknown'}
                </Text>
                <Text style={styles.detailAuthorMeta}>
                  Added {formatTimeAgo(selected.created_at)}
                </Text>
              </View>
            </View>
            {hasVideo ? (
              videoError ? (
                <View
                  style={[
                    styles.playBtn,
                    { backgroundColor: '#182437', borderColor: '#22304A', borderWidth: 0.5 },
                  ]}
                >
                  <Text style={[styles.playBtnTxt, { color: '#9FB0C9', fontSize: 13 }]}>
                    {videoError}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.playBtn, videoLoading && { opacity: 0.6 }]}
                  onPress={handlePlay}
                  disabled={videoLoading}
                >
                  {videoLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.playBtnTxt}>{'▶  Play Video'}</Text>
                  )}
                </TouchableOpacity>
              )
            ) : (
              <View
                style={[
                  styles.playBtn,
                  { backgroundColor: '#182437', borderColor: '#22304A', borderWidth: 0.5 },
                ]}
              >
                <Text style={[styles.playBtnTxt, { color: '#6B7C97' }]}>
                  {'No Video Available'}
                </Text>
              </View>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
          {isPlaying && selected?.video_url && (
            <VideoPlayerOverlay
              player={player}
              onClose={() => setIsPlaying(false)}
              postId={selected.id}
              postTitle={selected.title ?? undefined}
            />
          )}
        </View>
      </Modal>
    );
  },
);
DetailModal.displayName = 'DetailModal';

const styles = StyleSheet.create({
  detailModal: { flex: 1, backgroundColor: Colors.bg },
  detailHero: { height: H * 0.4, position: 'relative', backgroundColor: Colors.brandBlue },
  detailHeroImg: { width: '100%', height: '100%' },
  detailHeroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandBlueDim,
  },
  detailClose: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCloseTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  detailBody: { flex: 1, padding: 20 },
  detailBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  detailBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.brandBlueDim,
    borderWidth: 0.5,
    borderColor: Colors.brandBlue,
  },
  detailBadgeTxt: { fontSize: 11, color: Colors.brandBlue, fontWeight: '700', letterSpacing: 0.5 },
  detailTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 8,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  detailEpisode: { fontSize: 14, color: Colors.brandBlue, fontWeight: '700', marginBottom: 12 },
  detailDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    fontWeight: '500',
    marginBottom: 24,
  },
  detailAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  detailAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailAvatarTxt: { color: '#fff', fontSize: 13, fontWeight: '900' },
  detailAuthorName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  detailAuthorMeta: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  playBtn: {
    backgroundColor: Colors.brandBlue,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  playBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
});
