import { VideoPlayerOverlay } from '@/components/player/VideoPlayerOverlay';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Dimensions,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { useRecordProgress, getSavedPosition } from '@/hooks/useWatchHistory';
import { PostService, ChannelPost } from '@/lib/data/posts';
import { StreamService } from '@/lib/video/stream';
import { useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { Colors } from '@/constants/theme';

const H = Dimensions.get('window').height;

export const DetailModal = memo(
  ({
    selected,
    onClose,
    userId,
  }: {
    selected: ChannelPost | null;
    onClose: () => void;
    userId: string | undefined;
  }) => {
    const insets = useSafeAreaInsets();
    const [isPlaying, setIsPlaying] = useState(false);
    // Premium (access_level='premium') Stream videos need a server-minted
    // signed URL — see lib/stream.ts. Free videos and R2 post-videos resolve
    // synchronously with no extra network call.
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoLoading, setVideoLoading] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);

    const hasVideoSource =
      !!selected?.video_url || !!(selected?.media_url && selected.media_type === 'video');

    useEffect(() => {
      let cancelled = false;
      setVideoError(null);
      if (selected?.video_url) {
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
          // See the matching comment in app/(tabs)/channels/[id].tsx.
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
      } else if (selected?.media_url && selected.media_type === 'video') {
        setVideoUrl(PostService.getMediaPublicUrl(selected.media_url));
      } else {
        setVideoUrl(null);
      }
      return () => {
        cancelled = true;
      };
    }, [
      selected?.id,
      selected?.video_url,
      selected?.access_level,
      selected?.media_url,
      selected?.media_type,
    ]);

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
      if (isPlaying) player.play();
      else {
        player.pause();
        saveProgress();
      }
    }, [isPlaying, player, saveProgress]);

    if (!selected) return null;
    const thumb = selected.thumbnail_url
      ? PostService.getMediaPublicUrl(selected.thumbnail_url)
      : null;

    const handleShare = async () => {
      try {
        await Share.share({ message: selected.title ?? 'Check this out on Cloudlynk' });
      } catch {}
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
                <Icon name="film" size={56} color={Colors.textMuted} />
              </View>
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.92)']}
              style={StyleSheet.absoluteFill}
            />
            <TouchableOpacity
              style={[styles.detailClose, { top: insets.top + 12 }]}
              onPress={onClose}
            >
              <Text style={styles.detailCloseTxt}>{'✕'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
            <View style={styles.detailBadgeRow}>
              <View style={styles.detailBadge}>
                <Text style={styles.detailBadgeTxt}>{selected.content_type.toUpperCase()}</Text>
              </View>
              {!!selected.genre && (
                <View style={styles.detailBadge}>
                  <Text style={styles.detailBadgeTxt}>{selected.genre}</Text>
                </View>
              )}
              {!!selected.duration_min && (
                <View style={styles.detailBadge}>
                  <Text style={styles.detailBadgeTxt}>{selected.duration_min}m</Text>
                </View>
              )}
            </View>
            <Text style={styles.detailTitle}>{selected.title ?? 'Untitled'}</Text>
            {!!selected.body && <Text style={styles.detailDesc}>{selected.body}</Text>}

            {hasVideoSource ? (
              videoError ? (
                <View style={[styles.playBtn, { backgroundColor: '#9FB0C9' }]}>
                  <Text style={[styles.playBtnTxt, { color: '#6B7C97', fontSize: 13 }]}>
                    {videoError}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.playBtn, videoLoading && { opacity: 0.6 }]}
                  onPress={() => {
                    if (videoUrl) setIsPlaying(true);
                  }}
                  disabled={videoLoading || !videoUrl}
                >
                  {videoLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.playBtnTxt}>{'▶  Play Video'}</Text>
                  )}
                </TouchableOpacity>
              )
            ) : (
              <View style={[styles.playBtn, { backgroundColor: '#9FB0C9' }]}>
                <Text style={[styles.playBtnTxt, { color: '#6B7C97' }]}>
                  {'No Video Available'}
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
              <Text style={styles.shareBtnTxt}>{'↗  Share'}</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
          {isPlaying && videoUrl && (
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
  detailHero: { height: H * 0.4, position: 'relative', backgroundColor: Colors.brand },
  detailHeroImg: { width: '100%', height: '100%' },
  detailHeroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
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
  detailCloseTxt: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  detailBody: { flex: 1, padding: 20 },
  detailBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  detailBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.brandLight,
    borderWidth: 0.5,
    borderColor: Colors.brand,
  },
  detailBadgeTxt: { fontSize: 11, color: Colors.brand, fontWeight: '800', letterSpacing: 0.5 },
  detailTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 8,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  detailDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    fontWeight: '500',
    marginBottom: 20,
  },
  playBtn: {
    backgroundColor: Colors.brand,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  playBtnTxt: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  shareBtn: {
    backgroundColor: Colors.bg,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  shareBtnTxt: { color: Colors.text, fontSize: 14, fontWeight: '700' },
});
