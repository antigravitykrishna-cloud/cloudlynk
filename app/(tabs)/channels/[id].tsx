import { VideoPlayerOverlay } from '../../../components/VideoPlayerOverlay';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Image, Modal, TextInput, ActivityIndicator, RefreshControl, Dimensions, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { showAlert } from '../../../components/Feedback';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../../hooks/useAuth';
import { useRecordProgress, getSavedPosition } from '../../../hooks/useWatchHistory';
import { ChannelService, BlockService, ReportService } from '../../../lib/channels';
import { PostService, ChannelPost, ContentType, GENRES } from '../../../lib/posts';
import { StreamService, VideoMeta, STREAM_MAX_MB } from '../../../lib/stream';
import { Database, supabase } from '../../../lib/supabase';
import { formatTimeAgo } from '../../../lib/storage';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { Colors } from '../../../constants/theme';
import { Icon, type IconName } from '../../../components/Icon';

// guards-allow-select-star
// Channel detail is gated behind requireSubscription in the Channels tab, so anon never reaches this query.
// See scripts/guards.mjs check 2 for why select('*') is unsafe on a
// guest-reachable path.

const { width: W, height: H } = Dimensions.get('window');
const CARD_W = 120;
const CARD_H = 170;
const HERO_H = H * 0.52;

type Channel = Database['public']['Tables']['channels']['Row'];

const CONTENT_TYPES: { id: ContentType; label: string; icon: IconName }[] = [
  { id: 'movie',  label: 'Movie',      icon: 'film' },
  { id: 'series', label: 'Web Series', icon: 'tv' },
  { id: 'short',  label: 'Short Film', icon: 'video' },
  { id: 'post',   label: 'Post',       icon: 'document' },
];

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getTypeColor(type: ContentType): string {
  const map: Record<ContentType, string> = {
    movie: '#2E7DFF', series: '#0090ff', short: '#00d4aa', post: '#a371f7',
  };
  return map[type] ?? '#2E7DFF';
}

// ── Extracted components — defined OUTSIDE parent to prevent remount on rerender

const ContentCard = memo(({ item, onPress }: { item: ChannelPost; onPress: () => void }) => {
  const thumb = item.thumbnail_url ? PostService.getMediaPublicUrl(item.thumbnail_url) : null;
  const isPending = item.status === 'pending';
  const isRejected = item.status === 'rejected';
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardThumb}>
        {thumb
          ? <Image source={{ uri: thumb }} style={styles.cardThumbImg} resizeMode="cover" />
          : <View style={styles.cardThumbPlaceholder}>
              <Icon
                name={item.content_type === 'movie' ? 'film' : item.content_type === 'series' ? 'tv' : item.content_type === 'short' ? 'video' : 'document'}
                size={26}
                color={Colors.textMuted}
              />
            </View>
        }
        <View style={[styles.cardTypeBadge, { backgroundColor: getTypeColor(item.content_type) }]}>
          <Text style={styles.cardTypeTxt}>
            {item.content_type === 'movie' ? 'MOVIE' : item.content_type === 'series' ? 'SERIES' : item.content_type === 'short' ? 'SHORT' : 'POST'}
          </Text>
        </View>
        {(isPending || isRejected) && (
          <View style={[styles.statusOverlay, { backgroundColor: isPending ? 'rgba(227,179,65,0.85)' : 'rgba(248,81,73,0.85)' }]}>
            <Text style={styles.statusOverlayTxt}>{isPending ? '⏳ Review' : '✕ Rejected'}</Text>
          </View>
        )}
        {!!item.duration_min && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationTxt}>{formatDuration(item.duration_min)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title ?? 'Untitled'}</Text>
      {item.content_type === 'series' && item.season_number && item.episode_number && (
        <Text style={styles.cardEpTxt}>S{item.season_number} E{item.episode_number}</Text>
      )}
    </TouchableOpacity>
  );
});
ContentCard.displayName = 'ContentCard';

const GenreRow = memo(({ genre, items, onSelect }: {
  genre: string; items: ChannelPost[]; onSelect: (item: ChannelPost) => void;
}) => (
  <View style={styles.genreSection}>
    <Text style={styles.genreLabel}>{genre}</Text>
    <FlatList
      data={items}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={i => i.id}
      contentContainerStyle={styles.genreRow}
      renderItem={({ item }) => <ContentCard item={item} onPress={() => onSelect(item)} />}
    />
  </View>
));
GenreRow.displayName = 'GenreRow';

// ── Genre picker as a standalone modal (not nested)
const GenrePickerModal = memo(({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: string; onSelect: (g: string) => void; onClose: () => void;
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <TouchableOpacity style={styles.genrePickerOverlay} activeOpacity={1} onPress={onClose}>
      <View style={styles.genrePickerSheet}>
        <Text style={styles.genrePickerTitle}>Select Genre</Text>
        <ScrollView keyboardShouldPersistTaps="handled">
          {GENRES.map(g => (
            <TouchableOpacity key={g} style={styles.genrePickerRow} onPress={() => { onSelect(g); onClose(); }}>
              <Text style={[styles.genrePickerTxt, selected === g && { color: '#2E7DFF' }]}>{g}</Text>
              {selected === g && <Text style={{ color: '#2E7DFF', fontSize: 16 }}>{'✓'}</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.genrePickerCancel} onPress={onClose}>
          <Text style={{ color: '#9FB0C9', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
));
GenrePickerModal.displayName = 'GenrePickerModal';

// ── Detail modal as standalone
const DetailModal = memo(({ selected, onClose, userId, channelId }: {
  selected: ChannelPost | null; onClose: () => void; userId: string | undefined; channelId: string | undefined;
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
      ChannelService.reportContent(channelId, userId, reason, { postId: selected.id, reportedUserId: selected.author_id })
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
          text: 'Block', style: 'destructive', onPress: () => {
            BlockService.blockUser(userId, selected.author_id)
              .then(() => { showAlert('Blocked'); onClose(); })
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
    showAlert(`Report ${selected.author?.full_name ?? 'this user'}`, 'Why are you reporting this account?', [
      { text: 'Harassment or bullying', onPress: () => submit('harassment') },
      { text: 'Spam or scam account', onPress: () => submit('spam') },
      { text: 'Impersonation', onPress: () => submit('impersonation') },
      { text: 'Hate speech', onPress: () => submit('hate_speech') },
      { text: 'Other', onPress: () => submit('other') },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
        .then((url) => { if (!cancelled) setVideoUrl(url); })
        .catch((err: any) => { if (!cancelled) setVideoError(err?.message ?? "This video isn't available."); })
        .finally(() => { if (!cancelled) setVideoLoading(false); });
    } else {
      // v57: free playback is async now. Videos are created locked, so a free
      // post whose unlock did not land needs the signed-token fallback rather
      // than a plain URL that 403s. The common case still resolves without a
      // round trip — see StreamService.resolveFreePlaybackUrl.
      setVideoLoading(true);
      StreamService.resolveFreePlaybackUrl(selected.id, selected.video_url)
        .then((url) => { if (!cancelled) setVideoUrl(url); })
        .catch((err: any) => { if (!cancelled) setVideoError(err?.message ?? "This video isn't available."); })
        .finally(() => { if (!cancelled) setVideoLoading(false); });
    }
    return () => { cancelled = true; };
  }, [selected?.id, selected?.video_url, selected?.access_level]);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 5;
  });

  const { updatePosition, saveProgress } = useRecordProgress(userId, selected?.id, isPlaying);

  const timeUpdate = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
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
  const thumb = selected.thumbnail_url ? PostService.getMediaPublicUrl(selected.thumbnail_url) : null;
  const hasVideo = !!selected.video_url;

  const handlePlay = async () => {
    if (!selected.video_url) return;
    if (videoError) { showAlert('Cannot play', videoError); return; }
    if (selected.access_level === 'premium' && !videoUrl) return; // still fetching the signed URL
    setIsPlaying(true);
  };

  return (
    <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.detailModal}>
        <View style={styles.detailHero}>
          {thumb
            ? <Image source={{ uri: thumb }} style={styles.detailHeroImg} resizeMode="cover" />
            : <View style={[styles.detailHeroImg, styles.detailHeroPlaceholder]}><Icon name="film" size={64} color={Colors.textMuted} /></View>
          }
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.95)']} style={StyleSheet.absoluteFill} />
          <TouchableOpacity style={[styles.detailClose, { top: insets.top + 12, right: 62 }]} onPress={handleMore}>
            <Text style={styles.detailCloseTxt}>{'⋯'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.detailClose, { top: insets.top + 12 }]} onPress={onClose}>
            <Text style={styles.detailCloseTxt}>{'✕'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
          <View style={styles.detailBadgeRow}>
            <View style={[styles.detailBadge, { backgroundColor: getTypeColor(selected.content_type) + '33', borderColor: getTypeColor(selected.content_type) + '88' }]}>
              <Text style={[styles.detailBadgeTxt, { color: getTypeColor(selected.content_type) }]}>{selected.content_type.toUpperCase()}</Text>
            </View>
            {!!selected.genre && <View style={styles.detailBadge}><Text style={styles.detailBadgeTxt}>{selected.genre}</Text></View>}
            {!!selected.release_year && <View style={styles.detailBadge}><Text style={styles.detailBadgeTxt}>{selected.release_year}</Text></View>}
            {!!selected.duration_min && <View style={styles.detailBadge}><Text style={styles.detailBadgeTxt}>{formatDuration(selected.duration_min)}</Text></View>}
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
                {(selected.author?.full_name ?? 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.detailAuthorName}>{selected.author?.full_name ?? 'Unknown'}</Text>
              <Text style={styles.detailAuthorMeta}>Added {formatTimeAgo(selected.created_at)}</Text>
            </View>
          </View>
          {hasVideo ? (
            videoError ? (
              <View style={[styles.playBtn, { backgroundColor: '#182437', borderColor: '#22304A', borderWidth: 0.5 }]}>
                <Text style={[styles.playBtnTxt, { color: '#9FB0C9', fontSize: 13 }]}>{videoError}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.playBtn, videoLoading && { opacity: 0.6 }]}
                onPress={handlePlay}
                disabled={videoLoading}
              >
                {videoLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.playBtnTxt}>{'▶  Play Video'}</Text>}
              </TouchableOpacity>
            )
          ) : (
            <View style={[styles.playBtn, { backgroundColor: '#182437', borderColor: '#22304A', borderWidth: 0.5 }]}>
              <Text style={[styles.playBtnTxt, { color: '#6B7C97' }]}>{'No Video Available'}</Text>
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
        {isPlaying && selected?.video_url && (
          <VideoPlayerOverlay player={player} onClose={() => setIsPlaying(false)} postId={selected.id} postTitle={selected.title ?? undefined} />
        )}
      </View>
    </Modal>
  );
});
DetailModal.displayName = 'DetailModal';

// ── Create content modal as standalone
const CreateModal = memo(({ visible, onClose, onSubmit, channelId }: {
  visible: boolean;
  channelId: string;
  onClose: () => void;
  onSubmit: (data: {
    contentType: ContentType; postTitle: string; postBody: string; genre: string;
    durationMin: string; seasonNo: string; episodeNo: string;
    episodeTitle: string; releaseYear: string; thumbnailUri: string | null;
    streamVideoUid: string | null;
  }) => Promise<void>;
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(-1); // -1 = idle
  const [contentType, setContentType] = useState<ContentType>('movie');
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [genre, setGenre] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [seasonNo, setSeasonNo] = useState('');
  const [episodeNo, setEpisodeNo] = useState('');
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [releaseYear, setReleaseYear] = useState(String(new Date().getFullYear()));
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [showGenrePicker, setShowGenrePicker] = useState(false);

  const reset = () => {
    setPostTitle(''); setPostBody(''); setGenre('');
    setDurationMin(''); setSeasonNo(''); setEpisodeNo('');
    setEpisodeTitle(''); setReleaseYear(String(new Date().getFullYear()));
    setThumbnailUri(null); setVideoMeta(null); setUploadProgress(-1); setContentType('movie');
  };

  const handleCancel = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!postTitle.trim()) { showAlert('Required', 'Please add a title.'); return; }
    if (!postBody.trim()) { showAlert('Required', 'Please add a description.'); return; }
    setSubmitting(true);
    let streamVideoUid: string | null = null;
    try {
      if (videoMeta) {
        setUploadProgress(0);
        streamVideoUid = await StreamService.uploadVideo(videoMeta, (pct) => setUploadProgress(pct), channelId);
        setUploadProgress(1);
      }
      await onSubmit({ contentType, postTitle, postBody, genre, durationMin, seasonNo, episodeNo, episodeTitle, releaseYear, thumbnailUri, streamVideoUid });
      reset();
    } catch (err: any) {
      showAlert('Upload failed', err.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
      setUploadProgress(-1);
    }
  };

  const handlePickThumbnail = async () => {
    if (picking || submitting) return;
    setPicking(true);
    try {
      const result = await PostService.pickImage();
      if (result) setThumbnailUri(result.uri);
    } catch (err: any) { showAlert('Permission required', err.message); }
    finally { setPicking(false); }
  };

  const handlePickVideo = async () => {
    if (picking || submitting) return;
    setPicking(true);
    try {
      const result = await StreamService.pickVideo();
      if (result) {
        // Cloudflare Stream (Bundle Basic) caps each file at 200MB; 180MB leaves
        // headroom for multipart overhead. Reject early so the user isn't told
        // only after a long upload that ends in a 413. Bump this after a plan upgrade.
        const STREAM_MAX_MB = 180;
        if (result.size > STREAM_MAX_MB * 1024 * 1024) {
          showAlert(
            'File too large',
            `This video is ${(result.size / 1024 / 1024).toFixed(0)} MB. The current upload limit is ${STREAM_MAX_MB} MB. Please pick a smaller file.`
          );
          return;
        }
        setVideoMeta(result);
      }
    } catch (err: any) { showAlert('Error', err.message); }
    finally { setPicking(false); }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleCancel}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.createModal}>
            <View style={styles.createHeader}>
              <TouchableOpacity onPress={handleCancel}>
                <Text style={styles.createCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.createTitle}>Add Content</Text>
              <TouchableOpacity onPress={handleSubmit} disabled={submitting || !postTitle.trim()}>
                {submitting
                  ? <ActivityIndicator color="#2E7DFF" size="small" />
                  : <Text style={[styles.createSubmit, !postTitle.trim() && { opacity: 0.3 }]}>Submit</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.createBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
              <Text style={styles.createLabel}>TYPE</Text>
              <View style={styles.typeRow}>
                {CONTENT_TYPES.map(ct => (
                  <TouchableOpacity
                    key={ct.id}
                    style={[styles.typeChip, contentType === ct.id && styles.typeChipActive]}
                    onPress={() => setContentType(ct.id)}
                  >
                    <Icon name={ct.icon} size={18} color={Colors.textSecondary} />
                    <Text style={[styles.typeChipTxt, contentType === ct.id && { color: '#2E7DFF' }]}>{ct.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.createLabel}>THUMBNAIL</Text>
              <TouchableOpacity
                style={styles.thumbPicker}
                onPress={handlePickThumbnail}
                disabled={picking || submitting}
              >
                {thumbnailUri
                  ? <Image source={{ uri: thumbnailUri }} style={styles.thumbPreview} resizeMode="cover" />
                  : <View style={styles.thumbEmpty}>
                      <View style={{ marginBottom: 8 }}><Icon name="image" size={30} color={Colors.textMuted} /></View>
                      <Text style={styles.thumbEmptyTxt}>Add Thumbnail</Text>
                    </View>
                }
              </TouchableOpacity>

              <Text style={styles.createLabel}>VIDEO FILE</Text>
              <TouchableOpacity
                style={[styles.videoPicker, videoMeta && styles.videoPickerSelected]}
                onPress={handlePickVideo}
                disabled={picking || submitting}
              >
                {picking
                  ? <>
                      <ActivityIndicator color="#2E7DFF" size="small" style={{ marginBottom: 6 }} />
                      <Text style={styles.videoPickerTxt}>Selecting…</Text>
                    </>
                  : <>
                      <Icon name={videoMeta ? 'film' : 'folder'} size={22} color={Colors.textMuted} />
                      <Text style={styles.videoPickerTxt} numberOfLines={1}>
                        {videoMeta ? videoMeta.name : 'Pick Video File'}
                      </Text>
                      {videoMeta && (
                        <Text style={styles.videoPickerSize}>
                          {(videoMeta.size / (1024 * 1024)).toFixed(1)} MB · tap to change
                        </Text>
                      )}
                    </>
                }
              </TouchableOpacity>

              {uploadProgress >= 0 && (
                <View style={styles.progressWrapper}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${Math.round(uploadProgress * 100)}%` }]} />
                  </View>
                  <Text style={styles.progressTxt}>
                    {uploadProgress < 1
                      ? `Uploading video… ${Math.round(uploadProgress * 100)}%`
                      : '✓ Upload complete'}
                  </Text>
                </View>
              )}

              <Text style={styles.createLabel}>TITLE *</Text>
              <TextInput
                style={styles.input}
                value={postTitle}
                onChangeText={setPostTitle}
                placeholder="Enter title"
                placeholderTextColor="#31425F"
                blurOnSubmit={false}
              />

              <Text style={styles.createLabel}>DESCRIPTION *</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={postBody}
                onChangeText={setPostBody}
                placeholder="What is this about?"
                placeholderTextColor="#31425F"
                multiline
                blurOnSubmit={false}
              />

              <Text style={styles.createLabel}>GENRE</Text>
              <TouchableOpacity style={[styles.input, { justifyContent: 'center' }]} onPress={() => setShowGenrePicker(true)}>
                <Text style={{ color: genre ? '#fff' : '#31425F', fontSize: 14 }}>
                  {genre || 'Select genre'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.createLabel}>RELEASE YEAR</Text>
              <TextInput
                style={styles.input}
                value={releaseYear}
                onChangeText={setReleaseYear}
                placeholder={String(new Date().getFullYear())}
                placeholderTextColor="#31425F"
                keyboardType="numeric"
                maxLength={4}
                blurOnSubmit={false}
              />

              {(contentType === 'movie' || contentType === 'short') && (
                <>
                  <Text style={styles.createLabel}>DURATION (minutes)</Text>
                  <TextInput
                    style={styles.input}
                    value={durationMin}
                    onChangeText={setDurationMin}
                    placeholder="e.g. 120"
                    placeholderTextColor="#31425F"
                    keyboardType="numeric"
                    blurOnSubmit={false}
                  />
                </>
              )}

              {contentType === 'series' && (
                <>
                  <View style={styles.rowInputs}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.createLabel}>SEASON</Text>
                      <TextInput style={styles.input} value={seasonNo} onChangeText={setSeasonNo}
                        placeholder="1" placeholderTextColor="#31425F" keyboardType="numeric" blurOnSubmit={false} />
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.createLabel}>EPISODE</Text>
                      <TextInput style={styles.input} value={episodeNo} onChangeText={setEpisodeNo}
                        placeholder="1" placeholderTextColor="#31425F" keyboardType="numeric" blurOnSubmit={false} />
                    </View>
                  </View>
                  <Text style={styles.createLabel}>EPISODE TITLE</Text>
                  <TextInput style={styles.input} value={episodeTitle} onChangeText={setEpisodeTitle}
                    placeholder="e.g. Pilot" placeholderTextColor="#31425F" blurOnSubmit={false} />
                </>
              )}

              <View style={styles.reviewNote}>
                <Text style={styles.reviewNoteTxt}>
                  All content is reviewed before going live.
                </Text>
              </View>
              <View style={{ height: 60 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <GenrePickerModal
        visible={showGenrePicker}
        selected={genre}
        onSelect={setGenre}
        onClose={() => setShowGenrePicker(false)}
      />
    </>
  );
});
CreateModal.displayName = 'CreateModal';

// ── Main screen
export default function ChannelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, canUpload, isAdmin } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [grouped, setGrouped] = useState<Record<string, ChannelPost[]>>({});
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [selected, setSelected] = useState<ChannelPost | null>(null);

  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== user?.id) {
      setChannel(null);
      setPosts([]);
      setGrouped({});
      setIsMember(false);
      setSelected(null);
      setLoading(true);
    }
    prevUserIdRef.current = user?.id;
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!id || !user?.id) return;
    try {
      const { data: ch } = await supabase
        .from('channels').select('*').eq('id', id).single();
      setChannel(ch as Channel);

      const { data: mem } = await supabase
        .from('channel_members').select('role')
        .eq('channel_id', id).eq('user_id', user.id).maybeSingle();
      // Owners are implicitly members even without a channel_members row
      setIsMember(!!mem || (ch as Channel)?.owner_id === user.id);

      const [allPosts, blockedIds] = await Promise.all([
        PostService.getChannelPosts(id, user.id),
        BlockService.getBlockedUserIds(user.id).catch(() => [] as string[]),
      ]);
      const visiblePosts = blockedIds.length
        ? allPosts.filter(p => !blockedIds.includes(p.author_id))
        : allPosts;
      setPosts(visiblePosts);
      setGrouped(PostService.groupByGenre(visiblePosts));
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  const handleJoin = async () => {
    if (!id || !user?.id) return;
    setJoining(true);
    try {
      await ChannelService.joinChannel(id, user.id);
      setIsMember(true); await load();
    } catch (err: any) { showAlert('Error', err.message); }
    finally { setJoining(false); }
  };

  const hero = grouped['Featured']?.[0] ?? null;
  const heroThumb = hero?.thumbnail_url ? PostService.getMediaPublicUrl(hero.thumbnail_url) : null;
  const groupKeys = Object.keys(grouped);
  const hasContent = posts.filter(p => p.status === 'approved').length > 0;
  const hasPendingContent = posts.filter(p => p.status === 'pending' || p.status === 'draft').length > 0;
  const pendingPosts = posts.filter(p => p.status === 'pending' || p.status === 'draft');

  if (loading) {
    return (
      <View style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#2E7DFF" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2E7DFF" />}>

        <View style={[styles.hero, { height: HERO_H }]}>
          {heroThumb
            ? <Image source={{ uri: heroThumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFill, styles.heroPlaceholder]} />
          }
          <LinearGradient colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.5)', '#000']} style={StyleSheet.absoluteFill} />

          <TouchableOpacity style={[styles.heroBack, { top: insets.top + 8 }]} onPress={() => router.replace('/(tabs)/channels')}>
            <Text style={styles.heroBackTxt}>{'‹'}</Text>
          </TouchableOpacity>

          <View style={styles.heroBottom}>
            <Text style={styles.channelLabel}>{channel?.name ?? ''}</Text>
            {hero ? (
              <>
                <Text style={styles.heroTitle}>{hero.title}</Text>
                {!!hero.genre && (
                  <Text style={styles.heroGenre}>
                    {hero.genre}{hero.release_year ? ` · ${hero.release_year}` : ''}{hero.duration_min ? ` · ${formatDuration(hero.duration_min)}` : ''}
                  </Text>
                )}
                {isMember ? (
                  <View style={styles.heroActions}>
                    <TouchableOpacity style={styles.heroPlayBtn} onPress={() => setSelected(hero)}>
                      <Text style={styles.heroPlayTxt}>{'▶  Play'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.heroInfoBtn} onPress={() => setSelected(hero)}>
                      <Text style={styles.heroInfoTxt}>{'ⓘ  More Info'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.heroLockedHint}>{'Subscribe to play'}</Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.heroTitle}>{channel?.name}</Text>
                {!!channel?.description && channel.description !== channel?.name && (
                  <Text style={styles.heroGenre}>{channel.description}</Text>
                )}
              </>
            )}
            {!isMember && channel?.status === 'active' && (
              <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} disabled={joining}>
                {joining ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.joinTxt}>+ Subscribe to Channel</Text>}
              </TouchableOpacity>
            )}
            {isMember && <View style={styles.memberBadge}><Text style={styles.memberTxt}>{'✓ Subscribed'}</Text></View>}
          </View>
        </View>

        {isMember && (canUpload || isAdmin || channel?.owner_id === user?.id) && (
          <View style={styles.addBtnGroup}>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.push({ pathname: '/upload/add-content', params: { channelId: id } })}
            >
              <Text style={styles.addBtnTxt}>+ Add Content</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.queueBtn}
              onPress={() => router.push({ pathname: '/upload/queue', params: { channelId: id } })}
            >
              <Text style={styles.queueBtnTxt}>Upload Queue</Text>
            </TouchableOpacity>
          </View>
        )}
        {isMember && !canUpload && !isAdmin && channel?.owner_id !== user?.id && (
          <View style={styles.lockedBanner}>
            <Icon name="lock" size={16} color={Colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lockedBannerTitle}>Creator Access Locked</Text>
              <Text style={styles.lockedBannerDesc}>Contact the channel owner or upgrade your plan to submit content.</Text>
            </View>
          </View>
        )}

        {isMember && (canUpload || isAdmin || channel?.owner_id === user?.id) && hasPendingContent && (
          <View style={styles.pendingSection}>
            <Text style={styles.pendingSectionTitle}>⏳ Pending Review</Text>
            {pendingPosts.map(post => (
              <View key={post.id} style={styles.pendingCard}>
                <Text style={styles.pendingCardTitle}>{post.title ?? 'Untitled'}</Text>
                <Text style={styles.pendingCardMeta}>
                  {post.content_type?.toUpperCase()} · Submitted for review
                </Text>
              </View>
            ))}
          </View>
        )}

        {!isMember ? (
          <View style={styles.lockedContentCard}>
            <Icon name="lock" size={16} color={Colors.textMuted} />
            <Text style={styles.lockedContentTitle}>Subscribe to view content</Text>
            <Text style={styles.lockedContentDesc}>
              Join this channel to watch its movies, series, and short films.
            </Text>
            {channel?.status === 'active' && (
              <TouchableOpacity style={styles.lockedContentBtn} onPress={handleJoin} disabled={joining}>
                {joining
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.lockedContentBtnTxt}>+ Subscribe to Channel</Text>}
              </TouchableOpacity>
            )}
          </View>
        ) : !hasContent ? (
          <View style={styles.emptyState}>
            <Icon name="film" size={52} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No content yet</Text>
            <Text style={styles.emptyDesc}>Be the first to add a movie or series to this channel.</Text>
            {canUpload && (
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => router.push({ pathname: '/upload/add-content', params: { channelId: id } })}
              >
                <Text style={styles.emptyAddTxt}>Add First Content</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          groupKeys.map(g => <GenreRow key={g} genre={g} items={grouped[g]} onSelect={setSelected} />)
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <DetailModal selected={selected} onClose={() => setSelected(null)} userId={user?.id} channelId={id} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  hero: { width: W, position: 'relative', backgroundColor: Colors.brand },
  heroPlaceholder: { backgroundColor: Colors.brandLight },
  heroBack: { position: 'absolute', left: 16, zIndex: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  heroBackTxt: { fontSize: 26, color: '#fff', fontWeight: '700' },
  heroBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 24 },
  channelLabel: { fontSize: 12, color: Colors.brand, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6, textTransform: 'uppercase' },
  heroTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 6, letterSpacing: -0.5, lineHeight: 32 },
  heroGenre: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 16 },
  heroActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  heroPlayBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  heroPlayTxt: { color: '#000', fontSize: 15, fontWeight: '800' },
  heroInfoBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  heroInfoTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  joinBtn: { backgroundColor: Colors.brand, borderRadius: 6, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  joinTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  memberTxt: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '700' },
  addBtnGroup: { marginHorizontal: 16, marginTop: 20, gap: 8 },
  addBtn: { borderWidth: 1.5, borderColor: Colors.brand, borderRadius: 6, paddingVertical: 10, alignItems: 'center', borderStyle: 'dashed' },
  addBtnTxt: { color: Colors.brand, fontSize: 14, fontWeight: '800' },
  queueBtn: { borderWidth: 1, borderColor: Colors.accentOrange, borderRadius: 6, paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.accentOrangeDim },
  queueBtnTxt: { color: Colors.accentOrange, fontSize: 14, fontWeight: '700' },
  genreSection: { marginTop: 28 },
  genreLabel: { fontSize: 16, fontWeight: '800', color: Colors.text, paddingHorizontal: 16, marginBottom: 12, letterSpacing: -0.3 },
  genreRow: { paddingHorizontal: 16, gap: 10 },
  card: { width: CARD_W },
  cardThumb: { width: CARD_W, height: CARD_H, borderRadius: 6, overflow: 'hidden', backgroundColor: Colors.card, marginBottom: 6, position: 'relative', borderWidth: 0.5, borderColor: Colors.border },
  cardThumbImg: { width: '100%', height: '100%' },
  cardThumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceHover },
  cardTypeBadge: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  cardTypeTxt: { fontSize: 8, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
  statusOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 4, alignItems: 'center' },
  statusOverlayTxt: { fontSize: 10, fontWeight: '800', color: '#fff' },
  durationBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  durationTxt: { fontSize: 10, color: '#fff', fontWeight: '700' },
  cardTitle: { fontSize: 12, color: Colors.text, fontWeight: '700', lineHeight: 16 },
  cardEpTxt: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  detailModal: { flex: 1, backgroundColor: Colors.bg },
  detailHero: { height: H * 0.4, position: 'relative', backgroundColor: Colors.brand },
  detailHeroImg: { width: '100%', height: '100%' },
  detailHeroPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.brandLight },
  detailClose: { position: 'absolute', right: 16, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  detailCloseTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  detailBody: { flex: 1, padding: 20 },
  detailBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  detailBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.brandLight, borderWidth: 0.5, borderColor: Colors.brand },
  detailBadgeTxt: { fontSize: 11, color: Colors.brand, fontWeight: '700', letterSpacing: 0.5 },
  detailTitle: { fontSize: 26, fontWeight: '900', color: Colors.text, marginBottom: 8, letterSpacing: -0.5, lineHeight: 30 },
  detailEpisode: { fontSize: 14, color: Colors.brand, fontWeight: '700', marginBottom: 12 },
  detailDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, fontWeight: '500', marginBottom: 24 },
  detailAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  detailAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  detailAvatarTxt: { color: '#fff', fontSize: 13, fontWeight: '900' },
  detailAuthorName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  detailAuthorMeta: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  playBtn: { backgroundColor: Colors.brand, borderRadius: 8, paddingVertical: 16, alignItems: 'center' },
  playBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  videoPlayerContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  fullscreenVideo: { width: '100%', height: '100%' },
  videoCloseBtn: { position: 'absolute', left: 16, zIndex: 20, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)' },
  videoCloseBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  createModal: { flex: 1, backgroundColor: Colors.bg },
  createHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  createCancel: { fontSize: 15, color: '#9FB0C9', fontWeight: '600' },
  createTitle: { fontSize: 17, fontWeight: '900', color: '#fff' },
  createSubmit: { fontSize: 15, color: '#2E7DFF', fontWeight: '900' },
  createBody: { flex: 1, padding: 16 },
  createLabel: { fontSize: 10, fontWeight: '800', color: '#31425F', letterSpacing: 1.2, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#182437', borderRadius: 8, borderWidth: 0.5, borderColor: '#22304A', color: '#fff', fontSize: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4 },
  rowInputs: { flexDirection: 'row' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, backgroundColor: '#182437', borderRadius: 8, borderWidth: 0.5, borderColor: '#22304A' },
  typeChipActive: { borderColor: '#2E7DFF', backgroundColor: 'rgba(229,9,20,0.1)' },
  typeChipTxt: { fontSize: 10, color: '#9FB0C9', fontWeight: '700' },
  thumbPicker: { height: 180, backgroundColor: '#182437', borderRadius: 12, borderWidth: 0.5, borderColor: '#22304A', overflow: 'hidden', marginBottom: 4 },
  thumbPreview: { width: '100%', height: '100%' },
  thumbEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbEmptyTxt: { color: '#9FB0C9', fontSize: 14, fontWeight: '700' },
  reviewNote: { backgroundColor: '#182437', borderRadius: 8, borderWidth: 0.5, borderColor: '#22304A', padding: 14, marginTop: 8 },
  reviewNoteTxt: { color: '#6B7C97', fontSize: 12, fontWeight: '600', lineHeight: 18 },
  videoPicker: { backgroundColor: '#182437', borderRadius: 10, borderWidth: 0.5, borderColor: '#22304A', padding: 20, alignItems: 'center', marginBottom: 4 },
  videoPickerSelected: { borderColor: '#2E7DFF', backgroundColor: 'rgba(229,9,20,0.06)' },
  videoPickerTxt: { color: '#9FB0C9', fontSize: 13, fontWeight: '700', maxWidth: '90%', textAlign: 'center' },
  videoPickerSize: { color: '#31425F', fontSize: 11, fontWeight: '600', marginTop: 4 },
  progressWrapper: { marginTop: 8, marginBottom: 4 },
  progressBar: { height: 4, backgroundColor: '#182437', borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: '#2E7DFF', borderRadius: 2 },
  progressTxt: { fontSize: 11, color: '#2E7DFF', fontWeight: '700', textAlign: 'center' },
  genrePickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  genrePickerSheet: { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: H * 0.6, paddingTop: 20 },
  genrePickerTitle: { fontSize: 16, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 16, paddingHorizontal: 20 },
  genrePickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#182437' },
  genrePickerTxt: { fontSize: 15, color: '#9FB0C9', fontWeight: '600' },
  genrePickerCancel: { padding: 20, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: '#182437' },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 22, fontWeight: '900', color: Colors.text, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  emptyAddBtn: { backgroundColor: Colors.brand, borderRadius: 8, paddingHorizontal: 28, paddingVertical: 14 },
  emptyAddTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  pendingSection: { marginHorizontal: 16, marginTop: 20 },
  pendingSectionTitle: { fontSize: 14, fontWeight: '700', color: '#FFC65C', marginBottom: 10 },
  pendingCard: { backgroundColor: '#1a1400', borderRadius: 8, borderWidth: 1, borderColor: '#443300', padding: 12, marginBottom: 8 },
  pendingCardTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
  pendingCardMeta: { fontSize: 12, color: '#FFC65C', fontWeight: '600' },
  lockedBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 16, backgroundColor: '#111', borderRadius: 10, borderWidth: 0.5, borderColor: '#22304A', padding: 14 },
  lockedBannerIcon: { fontSize: 22 },
  lockedBannerTitle: { fontSize: 13, fontWeight: '800', color: '#aaa', marginBottom: 3 },
  lockedBannerDesc: { fontSize: 12, color: '#6B7C97', fontWeight: '600', lineHeight: 18 },
  lockedContentCard: { marginHorizontal: 16, marginTop: 24, padding: 32, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  lockedContentIcon: { fontSize: 48, marginBottom: 12 },
  lockedContentTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  lockedContentDesc: { fontSize: 14, color: Colors.textMuted, fontWeight: '500', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  lockedContentBtn: { backgroundColor: Colors.brand, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  lockedContentBtnTxt: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  heroLockedHint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginBottom: 12 },
});
