/**
 * Multi-entry upload screen.
 * User picks 1-N video files, fills metadata for each inline,
 * taps "Upload All" — queue starts and progress is shown in-place.
 * User stays on screen until all items are done or failed.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Radius, FontSize } from '../../constants/theme';
import { useUploadQueue } from '../../hooks/useUploadQueue';
import { StreamService } from '../../lib/stream';
import { PostService, ContentType, GENRES, AccessLevel, defaultAccessLevel } from '../../lib/posts';
import { Icon, type IconName } from '../../components/Icon';

const CONTENT_TYPES: { id: ContentType; label: string; icon: IconName }[] = [
  { id: 'movie',  label: 'Movie',      icon: 'film' },
  { id: 'series', label: 'Web Series', icon: 'tv' },
  { id: 'short',  label: 'Short Film', icon: 'video' },
  { id: 'post',   label: 'Post',       icon: 'document' },
];

type EntryForm = {
  video: { uri: string; name: string; size: number };
  thumbnailUri: string | null;
  contentType: ContentType;
  /** Whether viewers need an active premium plan to watch this. Defaults by
   *  content type (movies/series premium, shorts/posts free) but the
   *  creator can override it — see the FREE/PREMIUM toggle below. */
  accessLevel: AccessLevel;
  title: string;
  body: string;
  genre: string;
  durationMin: string;
  seriesName: string;
  seasonNo: string;
  episodeNo: string;
  episodeTitle: string;
  releaseYear: string;
};

function blankEntry(video: { uri: string; name: string; size: number }): EntryForm {
  return {
    video,
    thumbnailUri: null,
    contentType: 'movie',
    accessLevel: defaultAccessLevel('movie'),
    title: video.name.replace(/\.[^.]+$/, ''),
    body: '',
    genre: '',
    durationMin: '',
    seriesName: '',
    seasonNo: '',
    episodeNo: '',
    episodeTitle: '',
    releaseYear: String(new Date().getFullYear()),
  };
}

function deriveSeriesId(channelId: string, seriesName: string): string {
  const slug = seriesName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  let hash = 5381;
  const str = `${channelId}:${slug}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return `local-${channelId.slice(0, 8)}-${hash.toString(16).padStart(8, '0')}`;
}

function ProgressBar({ progress, status }: { progress: number; status: string }) {
  const pct = Math.round(progress * 100);
  const color = status === 'done' ? '#00d4aa' : status === 'failed' ? Colors.brand : '#2E7DFF';
  return (
    <View style={pb.wrap}>
      <View style={[pb.bar, { width: `${pct}%` as any, backgroundColor: color }]} />
      <Text style={pb.label}>
        {status === 'done' ? '✓ Done'
          : status === 'failed' ? '✕ Failed'
          : status === 'uploading' ? `${pct}%`
          : status === 'queued' ? 'Queued'
          : status === 'over_limit' ? 'Too large'
          : status}
      </Text>
    </View>
  );
}

const pb = StyleSheet.create({
  wrap: { height: 24, backgroundColor: Colors.surface, borderRadius: 4, overflow: 'hidden', marginTop: 8, justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  label: { fontSize: 11, fontWeight: '800', color: Colors.text, textAlign: 'center', zIndex: 1 },
});

export default function AddContentScreen() {
  const router = useRouter();
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const { addToQueue, startUpload, items, isUploading, maxItems, queuedCount } = useUploadQueue(channelId);

  const [entries, setEntries] = useState<EntryForm[]>([]);
  const [picking, setPicking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sessionItemIds, setSessionItemIds] = useState<string[]>([]);
  const [genrePickerFor, setGenrePickerFor] = useState<number | null>(null);
  const [thumbPickingFor, setThumbPickingFor] = useState<number | null>(null);

  const sessionItems = items.filter(i => sessionItemIds.includes(i.id));
  const allDone = sessionItems.length > 0 && sessionItems.every(i =>
    i.status === 'done' || i.status === 'failed' || i.status === 'over_limit'
  );

  // Debounce timer for series propagation — avoids re-rendering all sibling entries
  // on every keystroke, which interrupts the TextInput IME and causes "B only" bug.
  const propagateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateEntry = useCallback((idx: number, patch: Partial<EntryForm>) => {
    // Step 1: apply patch to source entry immediately (no propagation yet)
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));

    // Step 2: propagate to siblings only after user pauses typing (250ms)
    const isSeriesChange = 'contentType' in patch || 'seriesName' in patch
      || 'seasonNo' in patch || 'genre' in patch || 'releaseYear' in patch;
    if (!isSeriesChange) return;

    if (propagateTimer.current) clearTimeout(propagateTimer.current);
    propagateTimer.current = setTimeout(() => {
      setEntries(prev => {
        const source = prev[idx];
        if (!source || source.contentType !== 'series') return prev;

        let nextEp = parseInt(source.episodeNo || '1');
        const propagated = prev.map((e, i) => {
          if (i <= idx) return e;
          // Only propagate to entries the user hasn't individually customised
          const isUncustomised = !e.seriesName || source.seriesName.startsWith(e.seriesName) || e.seriesName === source.seriesName;
          if (!isUncustomised) return e;
          return {
            ...e,
            contentType: 'series' as ContentType,
            seriesName: source.seriesName,
            seasonNo: source.seasonNo,
            genre: source.genre,
            releaseYear: source.releaseYear,
            episodeNo: String(++nextEp),
          };
        });
        return propagated;
      });
    }, 250);
  }, []);

  const removeEntry = useCallback((idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAddVideos = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const videos = await StreamService.pickVideos();
      if (!videos.length) return;
      const slotsLeft = maxItems === Infinity
        ? videos.length
        : Math.max(0, maxItems - queuedCount - entries.length);
      if (slotsLeft === 0) {
        showAlert('Queue full', `Free plan allows up to ${maxItems} videos. Upgrade to add more.`);
        return;
      }
      const toAdd = videos.slice(0, slotsLeft);
      setEntries(prev => [...prev, ...toAdd.map(blankEntry)]);
      if (videos.length > slotsLeft) {
        showAlert('Limit reached', `${videos.length - slotsLeft} file(s) skipped — free plan limit of ${maxItems}.`);
      }
    } catch (err: any) {
      showAlert('Error', err.message ?? 'Could not pick videos');
    } finally {
      setPicking(false);
    }
  };

  const handlePickThumbnail = async (idx: number) => {
    if (thumbPickingFor !== null) return;
    setThumbPickingFor(idx);
    try {
      const result = await PostService.pickImage();
      if (result) updateEntry(idx, { thumbnailUri: result.uri });
    } catch (err: any) {
      showAlert('Permission required', err.message);
    } finally {
      setThumbPickingFor(null);
    }
  };

  const handleSubmit = async () => {
    if (!channelId) { showAlert('Error', 'No channel selected.'); return; }
    if (entries.length === 0) { showAlert('No videos', 'Add at least one video first.'); return; }

    const missingIdx = entries.findIndex(e => !e.title.trim());
    if (missingIdx !== -1) {
      showAlert('Title required', `Please add a title for video ${missingIdx + 1}.`);
      return;
    }

    const queueEntries = entries.map(e => ({
      video: e.video,
      title: e.title.trim(),
      body: e.body.trim(),
      contentType: e.contentType,
      accessLevel: e.accessLevel,
      genre: e.genre,
      durationMin: e.durationMin,
      seasonNo: e.seasonNo,
      episodeNo: e.episodeNo,
      episodeTitle: e.episodeTitle,
      releaseYear: e.releaseYear,
      thumbnailUri: e.thumbnailUri,
      seriesName: e.seriesName.trim(),
      seriesId: e.contentType === 'series' && e.seriesName.trim()
        ? deriveSeriesId(channelId, e.seriesName.trim())
        : null,
    }));

    try {
      const prevCount = items.length;
      const added = await addToQueue(queueEntries);
      if (added === 0) {
        showAlert('Queue full', 'Could not add videos — queue is at capacity.');
        return;
      }
      setSubmitted(true);
      // Capture IDs of newly added items (they are appended to the queue)
      // We read them in the useEffect below once items state updates
      await startUpload();
    } catch (err: any) {
      showAlert('Error', err.message ?? 'Failed to queue uploads');
    }
  };

  // Capture session item IDs after the queue state updates post-submit
  useEffect(() => {
    if (!submitted || sessionItemIds.length > 0) return;
    const entryTitles = new Set(entries.map(e => e.title.trim()).filter(Boolean));
    const matching = items.filter(i =>
      entryTitles.has(i.title) &&
      (i.status === 'queued' || i.status === 'uploading' || i.status === 'done' || i.status === 'failed')
    );
    if (matching.length > 0) {
      setSessionItemIds(matching.map(i => i.id));
    }
  }, [items, submitted, sessionItemIds.length, entries]);

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => {
                if (isUploading) {
                  showAlert(
                    'Upload in progress',
                    'Uploads are running. You can leave — they will continue.',
                    [{ text: 'Stay' }, { text: 'Leave', onPress: () => router.back() }],
                  );
                } else {
                  router.back();
                }
              }}
              style={styles.backBtn}
            >
              <Text style={styles.backTxt}>{'‹ Back'}</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add Content</Text>
            {!submitted ? (
              <TouchableOpacity
                style={[styles.submitBtn, entries.length === 0 && { opacity: 0.4 }]}
                onPress={handleSubmit}
                disabled={entries.length === 0}
              >
                <Text style={styles.submitBtnTxt}>Upload All</Text>
              </TouchableOpacity>
            ) : allDone ? (
              <TouchableOpacity style={styles.submitBtn} onPress={() => router.back()}>
                <Text style={styles.submitBtnTxt}>Done</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.submitBtn, { opacity: 0.6 }]}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            )}
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">

            {submitted && (
              <View style={styles.progressPanel}>
                <Text style={styles.progressTitle}>
                  {allDone ? '✓ All uploads complete' : isUploading ? 'Uploading…' : 'Queued'}
                </Text>
                {sessionItems.map((item, idx) => (
                  <View key={item.id} style={styles.progressRow}>
                    <Text style={styles.progressName} numberOfLines={1}>
                      {item.title || `Video ${idx + 1}`}
                    </Text>
                    <ProgressBar progress={item.progress} status={item.status} />
                    {item.error && <Text style={styles.progressError}>{item.error}</Text>}
                  </View>
                ))}
              </View>
            )}

            {!submitted && (
              <>
                <TouchableOpacity style={styles.addVideoBtn} onPress={handleAddVideos} disabled={picking} activeOpacity={0.75}>
                  {picking
                    ? <ActivityIndicator color={Colors.brand} size="small" />
                    : <Text style={styles.addVideoBtnTxt}>{'+ Add Videos'}</Text>}
                </TouchableOpacity>

                {entries.length === 0 && (
                  <View style={styles.empty}>
                    <Icon name="film" size={16} color={Colors.textMuted} />
                    <Text style={styles.emptyTxt}>No videos yet</Text>
                    <Text style={styles.emptySubTxt}>
                      {'Tap "Add Videos" to pick one or more files.\nFor a series, pick all episodes together.'}
                    </Text>
                  </View>
                )}

                {entries.map((entry, idx) => (
                  <View key={entry.video.uri + idx} style={styles.entryCard}>
                    <View style={styles.entryHeader}>
                      <Text style={styles.entryNum}>{'#' + (idx + 1)}</Text>
                      <View style={styles.entryVideoMeta}>
                        <Text style={styles.entryFileName} numberOfLines={1}>{entry.video.name}</Text>
                        <Text style={styles.entryFileSize}>{(entry.video.size / 1024 / 1024).toFixed(1)} MB</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeEntry(idx)} style={styles.removeBtn}>
                        <Text style={styles.removeBtnTxt}>{'✕'}</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>TYPE</Text>
                    <View style={styles.typeRow}>
                      {CONTENT_TYPES.map(ct => (
                        <TouchableOpacity
                          key={ct.id}
                          style={[styles.typeChip, entry.contentType === ct.id && styles.typeChipActive]}
                          onPress={() => updateEntry(idx, { contentType: ct.id, accessLevel: defaultAccessLevel(ct.id) })}
                        >
                          <Icon name={ct.icon} size={14} color={Colors.textSecondary} />
                          <Text style={[styles.typeChipTxt, entry.contentType === ct.id && { color: Colors.brand }]}>{ct.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.label}>ACCESS</Text>
                    <View style={styles.typeRow}>
                      <TouchableOpacity
                        style={[styles.typeChip, entry.accessLevel === 'free' && styles.typeChipActive]}
                        onPress={() => updateEntry(idx, { accessLevel: 'free' })}
                      >
                        <Icon name="lock" size={16} color={Colors.success} />
                        <Text style={[styles.typeChipTxt, entry.accessLevel === 'free' && { color: Colors.brand }]}>Free</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.typeChip, entry.accessLevel === 'premium' && styles.typeChipActive]}
                        onPress={() => updateEntry(idx, { accessLevel: 'premium' })}
                      >
                        <Icon name="lock" size={16} color={Colors.textMuted} />
                        <Text style={[styles.typeChipTxt, entry.accessLevel === 'premium' && { color: Colors.brand }]}>Premium</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.fieldHint}>
                      {entry.accessLevel === 'premium'
                        ? 'Only viewers with an active Premium plan can watch this.'
                        : 'Anyone can watch this for free.'}
                    </Text>

                    {entry.contentType === 'series' && (
                      <>
                        <Text style={styles.label}>SERIES NAME</Text>
                        <TextInput
                          style={styles.input}
                          value={entry.seriesName}
                          onChangeText={v => updateEntry(idx, { seriesName: v })}
                          placeholder="e.g. Breaking Bad"
                          placeholderTextColor={Colors.textMuted}
                          blurOnSubmit={false}
                        />
                        <Text style={styles.fieldHint}>
                          Episodes with the same series name are grouped together on the channel page.
                        </Text>
                      </>
                    )}

                    <Text style={styles.label}>THUMBNAIL</Text>
                    <TouchableOpacity
                      style={styles.thumbPicker}
                      onPress={() => handlePickThumbnail(idx)}
                      disabled={thumbPickingFor !== null}
                      activeOpacity={0.75}
                    >
                      {entry.thumbnailUri ? (
                        <Image source={{ uri: entry.thumbnailUri }} style={styles.thumbPreview} resizeMode="cover" />
                      ) : (
                        <View style={styles.thumbEmpty}>
                          {thumbPickingFor === idx
                            ? <ActivityIndicator color={Colors.brand} />
                            : <>
                                <Icon name="image" size={24} color={Colors.textMuted} />
                                <Text style={styles.thumbEmptyTxt}>Add Thumbnail</Text>
                              </>}
                        </View>
                      )}
                    </TouchableOpacity>

                    <Text style={styles.label}>TITLE *</Text>
                    <TextInput
                      style={styles.input}
                      value={entry.title}
                      onChangeText={v => updateEntry(idx, { title: v })}
                      placeholder={entry.video.name}
                      placeholderTextColor={Colors.textMuted}
                      blurOnSubmit={false}
                    />

                    <Text style={styles.label}>DESCRIPTION</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={entry.body}
                      onChangeText={v => updateEntry(idx, { body: v })}
                      placeholder="What is this about?"
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      blurOnSubmit={false}
                    />

                    <Text style={styles.label}>GENRE</Text>
                    <TouchableOpacity style={[styles.input, { justifyContent: 'center' }]} onPress={() => setGenrePickerFor(idx)}>
                      <Text style={{ color: entry.genre ? Colors.text : Colors.textMuted, fontSize: 14 }}>
                        {entry.genre || 'Select genre'}
                      </Text>
                    </TouchableOpacity>

                    <Text style={styles.label}>RELEASE YEAR</Text>
                    <TextInput
                      style={styles.input}
                      value={entry.releaseYear}
                      onChangeText={v => updateEntry(idx, { releaseYear: v })}
                      placeholder={String(new Date().getFullYear())}
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="numeric"
                      maxLength={4}
                      blurOnSubmit={false}
                    />

                    {(entry.contentType === 'movie' || entry.contentType === 'short') && (
                      <>
                        <Text style={styles.label}>DURATION (minutes)</Text>
                        <TextInput
                          style={styles.input}
                          value={entry.durationMin}
                          onChangeText={v => updateEntry(idx, { durationMin: v })}
                          placeholder="e.g. 120"
                          placeholderTextColor={Colors.textMuted}
                          keyboardType="numeric"
                          blurOnSubmit={false}
                        />
                      </>
                    )}

                    {entry.contentType === 'series' && (
                      <>
                        <View style={styles.rowInputs}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.label}>SEASON</Text>
                            <TextInput style={styles.input} value={entry.seasonNo}
                              onChangeText={v => updateEntry(idx, { seasonNo: v })}
                              placeholder="1" placeholderTextColor={Colors.textMuted}
                              keyboardType="numeric" blurOnSubmit={false} />
                          </View>
                          <View style={{ width: 10 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.label}>EPISODE</Text>
                            <TextInput style={styles.input} value={entry.episodeNo}
                              onChangeText={v => updateEntry(idx, { episodeNo: v })}
                              placeholder="1" placeholderTextColor={Colors.textMuted}
                              keyboardType="numeric" blurOnSubmit={false} />
                          </View>
                        </View>
                        <Text style={styles.label}>EPISODE TITLE</Text>
                        <TextInput style={styles.input} value={entry.episodeTitle}
                          onChangeText={v => updateEntry(idx, { episodeTitle: v })}
                          placeholder="e.g. Pilot" placeholderTextColor={Colors.textMuted}
                          blurOnSubmit={false} />
                      </>
                    )}

                    <View style={styles.entryDivider} />
                  </View>
                ))}

                {entries.length > 0 && (
                  <TouchableOpacity style={styles.addMoreBtn} onPress={handleAddVideos} disabled={picking} activeOpacity={0.75}>
                    <Text style={styles.addMoreBtnTxt}>{'+ Add More Videos'}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <View style={{ height: 60 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal visible={genrePickerFor !== null} transparent animationType="slide" onRequestClose={() => setGenrePickerFor(null)}>
        <TouchableOpacity style={styles.genreOverlay} activeOpacity={1} onPress={() => setGenrePickerFor(null)}>
          <View style={styles.genreSheet}>
            <Text style={styles.genreTitle}>Select Genre</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {GENRES.map(g => {
                const selected = genrePickerFor !== null && entries[genrePickerFor]?.genre === g;
                return (
                  <TouchableOpacity key={g} style={styles.genreRow}
                    onPress={() => { if (genrePickerFor !== null) updateEntry(genrePickerFor, { genre: g }); setGenrePickerFor(null); }}
                  >
                    <Text style={[styles.genreRowTxt, selected && { color: Colors.brand }]}>{g}</Text>
                    {selected && <Text style={{ color: Colors.brand, fontSize: 16 }}>{'✓'}</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.genreCancel} onPress={() => setGenrePickerFor(null)}>
              <Text style={styles.genreCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { backgroundColor: Colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { width: 60 },
  backTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  submitBtn: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, minWidth: 80, alignItems: 'center' },
  submitBtnTxt: { color: Colors.brand, fontSize: 13, fontWeight: '900' },
  body: { flex: 1, paddingHorizontal: 16 },
  progressPanel: { marginTop: 16, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, borderWidth: 1, borderColor: Colors.border },
  progressTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  progressRow: { marginBottom: 12 },
  progressName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  progressError: { fontSize: 11, color: Colors.brand, marginTop: 4, fontWeight: '600' },
  addVideoBtn: { marginTop: 16, borderWidth: 2, borderColor: Colors.brand, borderStyle: 'dashed', borderRadius: Radius.md, paddingVertical: 18, alignItems: 'center' },
  addVideoBtnTxt: { color: Colors.brand, fontSize: 15, fontWeight: '800' },
  empty: { alignItems: 'center', paddingTop: 48, paddingBottom: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTxt: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  emptySubTxt: { fontSize: 13, color: Colors.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  entryCard: { marginTop: 20 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  entryNum: { fontSize: FontSize.sm, fontWeight: '900', color: Colors.brand, width: 24 },
  entryVideoMeta: { flex: 1 },
  entryFileName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  entryFileSize: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  removeBtn: { padding: 6 },
  removeBtnTxt: { color: Colors.textMuted, fontSize: 16, fontWeight: '700' },
  label: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: 6, marginTop: 14 },
  fieldHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4, lineHeight: 16 },
  input: { backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, color: Colors.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  textArea: { height: 72, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', gap: 6 },
  typeChip: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 8, backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  typeChipActive: { borderColor: Colors.brand, backgroundColor: Colors.accentOrangeDim },
  typeChipTxt: { fontSize: 8, color: Colors.textMuted, fontWeight: '700' },
  thumbPicker: { height: 130, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 4 },
  thumbPreview: { width: '100%', height: '100%' },
  thumbEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbEmptyTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  rowInputs: { flexDirection: 'row' },
  entryDivider: { height: 1, backgroundColor: Colors.border, marginTop: 20 },
  addMoreBtn: { marginTop: 20, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  addMoreBtnTxt: { color: Colors.textMuted, fontSize: 14, fontWeight: '700' },
  genreOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  genreSheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', paddingTop: 20 },
  genreTitle: { fontSize: 16, fontWeight: '900', color: Colors.text, textAlign: 'center', marginBottom: 16 },
  genreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  genreRowTxt: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  genreCancel: { padding: 20, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: Colors.border },
  genreCancelTxt: { color: Colors.textMuted, fontWeight: '600', fontSize: 15 },
});
