/**
 * v0.7.0 Per-item upload form.
 * Edits metadata for a queued video before it uploads.
 * Mirrors CreateModal fields: content type, title, description,
 * genre, duration, season/episode, thumbnail.
 */

import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Image } from 'react-native';
import { showAlert } from '../../../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Radius, FontSize } from '../../../constants/theme';
import { useUploadQueue } from '../../../hooks/useUploadQueue';
import { QueueItem } from '../../../lib/uploadQueue';
import { PostService, ContentType, GENRES } from '../../../lib/posts';
import { Icon, type IconName } from '../../../components/Icon';

const CONTENT_TYPES: { id: ContentType; label: string; icon: IconName }[] = [
  { id: 'movie',  label: 'Movie',      icon: 'film' },
  { id: 'series', label: 'Web Series', icon: 'tv' },
  { id: 'short',  label: 'Short Film', icon: 'video' },
  { id: 'post',   label: 'Post',       icon: 'document' },
];

export default function FormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, updateItem } = useUploadQueue(undefined);

  const item = items.find((i: QueueItem) => i.id === id);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contentType, setContentType] = useState<ContentType>('movie');
  const [genre, setGenre] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [seasonNo, setSeasonNo] = useState('');
  const [episodeNo, setEpisodeNo] = useState('');
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [releaseYear, setReleaseYear] = useState(String(new Date().getFullYear()));
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [showGenrePicker, setShowGenrePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  // Load current values from queue item
  useEffect(() => {
    if (!item) return;
    setTitle(item.title || item.video.name || '');
    setBody(item.body || '');
    setContentType((item.contentType as ContentType) || 'movie');
    setGenre(item.genre || '');
    setDurationMin(item.durationMin || '');
    setSeasonNo(item.seasonNo || '');
    setEpisodeNo(item.episodeNo || '');
    setEpisodeTitle(item.episodeTitle || '');
    setReleaseYear(item.releaseYear || String(new Date().getFullYear()));
    setThumbnailUri(item.thumbnailUri || null);
  }, [item]);

  const handleSave = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateItem(id, {
        title: title.trim(),
        body: body.trim(),
        contentType,
        genre,
        durationMin,
        seasonNo,
        episodeNo,
        episodeTitle,
        releaseYear,
        thumbnailUri,
      });
    } catch (err: any) {
      showAlert('Error', err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [id, title, body, contentType, genre, durationMin, seasonNo, episodeNo, episodeTitle, releaseYear, thumbnailUri, updateItem]);

  const handleSaveAndNext = useCallback(async () => {
    await handleSave();
    // Find next queued item
    const currentIdx = items.findIndex((i: QueueItem) => i.id === id);
    const nextQueued = items.slice(currentIdx + 1).find((i: QueueItem) => i.status === 'queued');
    if (nextQueued) {
      router.replace({ pathname: '/upload/form/[id]', params: { id: nextQueued.id } });
    } else {
      router.replace({ pathname: '/upload/queue', params: {} });
    }
  }, [handleSave, items, id, router]);

  const handleSkip = useCallback(() => {
    const currentIdx = items.findIndex((i: QueueItem) => i.id === id);
    const nextQueued = items.slice(currentIdx + 1).find((i: QueueItem) => i.status === 'queued');
    if (nextQueued) {
      router.replace({ pathname: '/upload/form/[id]', params: { id: nextQueued.id } });
    } else {
      router.replace({ pathname: '/upload/queue', params: {} });
    }
  }, [items, id, router]);

  const handlePickThumbnail = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const result = await PostService.pickImage();
      if (result) setThumbnailUri(result.uri);
    } catch (err: any) {
      showAlert('Permission required', err.message);
    } finally {
      setPicking(false);
    }
  };

  if (!item) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backTxt}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Item</Text>
          <View style={{ width: 70 }} />
        </View>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Item not found in queue.</Text>
          <TouchableOpacity onPress={() => router.replace('/upload/queue')} style={styles.notFoundBtn}>
            <Text style={styles.notFoundBtnTxt}>Back to Queue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backTxt}>{'< Back'}</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Details</Text>
            <TouchableOpacity onPress={handleSaveAndNext} style={styles.saveBtn} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.saveBtnTxt}>Save & next</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
            {/* Video info */}
            <View style={styles.videoInfo}>
              <Icon name="film" size={16} color={Colors.textMuted} />
              <View style={styles.videoMeta}>
                <Text style={styles.videoName} numberOfLines={1}>{item.video.name}</Text>
                <Text style={styles.videoSize}>{(item.video.size / (1024 * 1024)).toFixed(0)} MB</Text>
              </View>
            </View>

            {/* Content type */}
            <Text style={styles.label}>TYPE</Text>
            <View style={styles.typeRow}>
              {CONTENT_TYPES.map(ct => (
                <TouchableOpacity
                  key={ct.id}
                  style={[styles.typeChip, contentType === ct.id && styles.typeChipActive]}
                  onPress={() => setContentType(ct.id)}
                >
                  <Icon name={ct.icon} size={16} color={Colors.textSecondary} />
                  <Text style={[styles.typeChipTxt, contentType === ct.id && { color: Colors.brand }]}>{ct.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Thumbnail */}
            <Text style={styles.label}>THUMBNAIL</Text>
            <TouchableOpacity style={styles.thumbPicker} onPress={handlePickThumbnail} disabled={picking}>
              {thumbnailUri ? (
                <Image source={{ uri: thumbnailUri }} style={styles.thumbPreview} resizeMode="cover" />
              ) : (
                <View style={styles.thumbEmpty}>
                  <Icon name="image" size={16} color={Colors.textMuted} />
                  <Text style={styles.thumbEmptyTxt}>Add Thumbnail</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Title */}
            <Text style={styles.label}>TITLE</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={item.video.name}
              placeholderTextColor={Colors.textMuted}
              blurOnSubmit={false}
            />

            {/* Description */}
            <Text style={styles.label}>DESCRIPTION</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={body}
              onChangeText={setBody}
              placeholder="What is this about?"
              placeholderTextColor={Colors.textMuted}
              multiline
              blurOnSubmit={false}
            />

            {/* Genre */}
            <Text style={styles.label}>GENRE</Text>
            <TouchableOpacity style={[styles.input, { justifyContent: 'center' }]} onPress={() => setShowGenrePicker(true)}>
              <Text style={{ color: genre ? Colors.text : Colors.textMuted, fontSize: 14 }}>
                {genre || 'Select genre'}
              </Text>
            </TouchableOpacity>

            {/* Release year */}
            <Text style={styles.label}>RELEASE YEAR</Text>
            <TextInput
              style={styles.input}
              value={releaseYear}
              onChangeText={setReleaseYear}
              placeholder={String(new Date().getFullYear())}
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              maxLength={4}
              blurOnSubmit={false}
            />

            {/* Duration (movie/short) */}
            {(contentType === 'movie' || contentType === 'short') && (
              <>
                <Text style={styles.label}>DURATION (minutes)</Text>
                <TextInput
                  style={styles.input}
                  value={durationMin}
                  onChangeText={setDurationMin}
                  placeholder="e.g. 120"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  blurOnSubmit={false}
                />
              </>
            )}

            {/* Series fields */}
            {contentType === 'series' && (
              <>
                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>SEASON</Text>
                    <TextInput style={styles.input} value={seasonNo} onChangeText={setSeasonNo}
                      placeholder="1" placeholderTextColor={Colors.textMuted} keyboardType="numeric" blurOnSubmit={false} />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>EPISODE</Text>
                    <TextInput style={styles.input} value={episodeNo} onChangeText={setEpisodeNo}
                      placeholder="1" placeholderTextColor={Colors.textMuted} keyboardType="numeric" blurOnSubmit={false} />
                  </View>
                </View>
                <Text style={styles.label}>EPISODE TITLE</Text>
                <TextInput style={styles.input} value={episodeTitle} onChangeText={setEpisodeTitle}
                  placeholder="e.g. Pilot" placeholderTextColor={Colors.textMuted} blurOnSubmit={false} />
              </>
            )}

            {/* Action buttons */}
            <View style={styles.formActions}>
              <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                <Text style={styles.skipBtnTxt}>Skip for now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveFullBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.saveFullBtnTxt}>Save</Text>}
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Genre picker */}
      <Modal visible={showGenrePicker} transparent animationType="slide" onRequestClose={() => setShowGenrePicker(false)}>
        <TouchableOpacity style={styles.genreOverlay} activeOpacity={1} onPress={() => setShowGenrePicker(false)}>
          <View style={styles.genreSheet}>
            <Text style={styles.genreTitle}>Select Genre</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {GENRES.map(g => (
                <TouchableOpacity key={g} style={styles.genreRow} onPress={() => { setGenre(g); setShowGenrePicker(false); }}>
                  <Text style={[styles.genreRowTxt, genre === g && { color: Colors.brand }]}>{g}</Text>
                  {genre === g && <Text style={{ color: Colors.brand, fontSize: 16 }}>{'✓'}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.genreCancel} onPress={() => setShowGenrePicker(false)}>
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
  header: {
    backgroundColor: Colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 70 },
  backTxt: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  saveBtn: { width: 90, alignItems: 'flex-end' },
  saveBtnTxt: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  body: { flex: 1, padding: 16 },
  videoInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  videoIcon: { fontSize: 28 },
  videoMeta: { flex: 1 },
  videoName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  videoSize: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  label: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipActive: { borderColor: Colors.brand, backgroundColor: Colors.accentOrangeDim },
  typeChipTxt: { fontSize: 9, color: Colors.textMuted, fontWeight: '700' },
  thumbPicker: {
    height: 160,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 4,
  },
  thumbPreview: { width: '100%', height: '100%' },
  thumbEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbEmptyTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  rowInputs: { flexDirection: 'row' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  skipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.sm,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skipBtnTxt: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  saveFullBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.sm,
    alignItems: 'center',
    backgroundColor: Colors.brand,
  },
  saveFullBtnTxt: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  notFoundText: { fontSize: 15, color: Colors.textMuted, fontWeight: '600', marginBottom: 16 },
  notFoundBtn: {
    backgroundColor: Colors.brand,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.sm,
  },
  notFoundBtnTxt: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  genreOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  genreSheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', paddingTop: 20 },
  genreTitle: { fontSize: 16, fontWeight: '900', color: Colors.text, textAlign: 'center', marginBottom: 16 },
  genreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  genreRowTxt: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  genreCancel: { padding: 20, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: Colors.border },
  genreCancelTxt: { color: Colors.textMuted, fontWeight: '600', fontSize: 15 },
});
