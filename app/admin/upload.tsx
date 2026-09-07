import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { StreamService, VideoMeta } from '../../lib/stream';
import { PostService, ContentType, AccessLevel, GENRES, defaultAccessLevel } from '../../lib/posts';
import { AdminContentService } from '../../lib/adminContent';

// Admin video upload — first-party Cloudlynk content, published into the
// official channel (channels.is_official, seeded by the v56 migration).
//
// Reuses the existing pipeline on purpose: StreamService.uploadVideo ->
// generate-stream-upload (whose can_post_to_channel check already passes an
// is_admin caller straight through) -> PostService.createPost. There is
// deliberately no second upload path.

const CONTENT_TYPES: { id: ContentType; label: string }[] = [
  { id: 'movie', label: 'Movie' },
  { id: 'series', label: 'Series' },
  { id: 'short', label: 'Short' },
  { id: 'post', label: 'Post' },
];

export default function AdminUploadScreen() {
  const router = useRouter();
  const { isAdmin, profile } = useAuth();

  const [channel, setChannel] = useState<{ id: string; name: string } | null>(null);
  const [channelLoading, setChannelLoading] = useState(true);

  const [video, setVideo] = useState<VideoMeta | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState<ContentType>('movie');
  const [genre, setGenre] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(defaultAccessLevel('movie'));
  const [genrePickerOpen, setGenrePickerOpen] = useState(false);

  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const loadChannel = useCallback(async () => {
    try {
      setChannel(await AdminContentService.getOfficialChannel());
    } catch (err) {
      if (__DEV__) console.error('AdminUpload channel error:', err);
    } finally {
      setChannelLoading(false);
    }
  }, []);

  useEffect(() => { loadChannel(); }, [loadChannel]);

  const pickVideo = async () => {
    try {
      const picked = await StreamService.pickVideo();
      if (picked) setVideo(picked);
    } catch (err: any) {
      showAlert('Could not pick video', err?.message ?? 'Please try again.');
    }
  };

  const pickThumbnail = async () => {
    try {
      const picked = await PostService.pickImage();
      if (picked) setThumbnailUri(picked.uri);
    } catch (err: any) {
      showAlert('Could not pick image', err?.message ?? 'Please try again.');
    }
  };

  const submit = async (saveAsDraft: boolean) => {
    if (!channel) { showAlert('No official channel', 'The Cloudlynk Official channel does not exist yet.'); return; }
    if (!profile?.id) { showAlert('Not signed in', 'Please sign in again.'); return; }
    if (!title.trim()) { showAlert('Title required', 'Give this content a title.'); return; }
    if (!video && contentType !== 'post') { showAlert('Video required', 'Pick a video file to upload.'); return; }

    setSubmitting(true);
    setProgress(0);
    try {
      let streamVideoUid: string | undefined;
      if (video) {
        streamVideoUid = await StreamService.uploadVideo(video, setProgress, channel.id);
      }

      await PostService.createPost(channel.id, profile.id, description.trim(), {
        title: title.trim(),
        thumbnailUri: thumbnailUri ?? undefined,
        contentType,
        genre: genre || undefined,
        durationMin: durationMin ? Number(durationMin) : undefined,
        streamVideoUid,
        accessLevel,
        saveAsDraft,
      });

      showAlert(
        saveAsDraft ? 'Saved as draft' : 'Published',
        saveAsDraft
          ? 'You can publish it from the Content screen when you are ready.'
          : 'It is live now.',
        [{ text: 'OK', onPress: () => router.replace('/admin/content') }],
      );
    } catch (err: any) {
      showAlert('Upload failed', err?.message ?? 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.headerBack} activeOpacity={0.7}>
            <Text style={styles.headerBackTxt}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Upload</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.emptyState}><Text style={styles.emptyText}>Access denied</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={styles.headerBackTxt}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upload</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {channelLoading ? (
            <ActivityIndicator color="#2E7DFF" style={{ marginTop: 30 }} />
          ) : !channel ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>
                The Cloudlynk Official channel does not exist yet. It is created by the v56 migration
                once an admin profile exists.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.blurb}>Publishing to {channel.name}.</Text>

              <View style={styles.card}>
                <TouchableOpacity style={styles.pickBtn} onPress={pickVideo} activeOpacity={0.7} disabled={submitting}>
                  <Text style={styles.pickBtnText}>
                    {video ? `${video.name} (${(video.size / 1048576).toFixed(1)} MB)` : 'Pick video file'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.pickBtn} onPress={pickThumbnail} activeOpacity={0.7} disabled={submitting}>
                  <Text style={styles.pickBtnText}>{thumbnailUri ? 'Change thumbnail' : 'Pick thumbnail'}</Text>
                </TouchableOpacity>
                {!!thumbnailUri && <Image source={{ uri: thumbnailUri }} style={styles.thumb} resizeMode="cover" />}
              </View>

              <View style={styles.card}>
                <Text style={styles.label}>Title</Text>
                <TextInput style={styles.input} value={title} onChangeText={setTitle}
                  placeholder="Title" placeholderTextColor="#6B7C97" editable={!submitting} />

                <Text style={styles.label}>Description</Text>
                <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription}
                  placeholder="Description" placeholderTextColor="#6B7C97" multiline editable={!submitting} />

                <Text style={styles.label}>Content type</Text>
                <View style={styles.chipRow}>
                  {CONTENT_TYPES.map(ct => (
                    <TouchableOpacity
                      key={ct.id}
                      style={[styles.chip, contentType === ct.id && styles.chipActive]}
                      onPress={() => { setContentType(ct.id); setAccessLevel(defaultAccessLevel(ct.id)); }}
                      activeOpacity={0.7}
                      disabled={submitting}
                    >
                      <Text style={[styles.chipText, contentType === ct.id && styles.chipTextActive]}>{ct.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Genre</Text>
                <TouchableOpacity style={styles.input} onPress={() => setGenrePickerOpen(!genrePickerOpen)} activeOpacity={0.7} disabled={submitting}>
                  <Text style={{ color: genre ? '#FFFFFF' : '#6B7C97', fontSize: 14 }}>{genre || 'Select a genre'}</Text>
                </TouchableOpacity>
                {genrePickerOpen && (
                  <View style={styles.chipRow}>
                    {GENRES.map(g => (
                      <TouchableOpacity
                        key={g}
                        style={[styles.chip, genre === g && styles.chipActive]}
                        onPress={() => { setGenre(g); setGenrePickerOpen(false); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.chipText, genre === g && styles.chipTextActive]}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={styles.label}>Duration (minutes)</Text>
                <TextInput style={styles.input} value={durationMin} onChangeText={setDurationMin}
                  placeholder="e.g. 118" placeholderTextColor="#6B7C97" keyboardType="number-pad" editable={!submitting} />

                <Text style={styles.label}>Access level</Text>
                <View style={styles.chipRow}>
                  {(['free', 'premium'] as AccessLevel[]).map(al => (
                    <TouchableOpacity
                      key={al}
                      style={[styles.chip, accessLevel === al && styles.chipActive]}
                      onPress={() => setAccessLevel(al)}
                      activeOpacity={0.7}
                      disabled={submitting}
                    >
                      <Text style={[styles.chipText, accessLevel === al && styles.chipTextActive]}>
                        {al === 'free' ? 'Free' : 'Premium'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.hint}>You can change this later from the Content screen.</Text>
              </View>

              {submitting && video && (
                <View style={styles.card}>
                  <Text style={styles.metaText}>Uploading… {Math.round(progress * 100)}%</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                  </View>
                </View>
              )}

              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => submit(true)} activeOpacity={0.7} disabled={submitting}>
                  <Text style={styles.cancelBtnText}>Save as draft</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={() => submit(false)} activeOpacity={0.7} disabled={submitting}>
                  {submitting
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
                    : <Text style={styles.confirmBtnText}>Publish</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B1220' },
  header: {
    backgroundColor: '#0B1220', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#22304A',
  },
  headerBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { color: '#2E7DFF', fontSize: 28, fontWeight: '700', lineHeight: 28 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  blurb: { color: '#9FB0C9', fontSize: 12, fontWeight: '500', marginBottom: 12 },
  card: { backgroundColor: '#182437', borderRadius: 12, borderWidth: 1, borderColor: '#22304A', padding: 16, marginBottom: 12 },
  pickBtn: { backgroundColor: '#22304A', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
  pickBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  thumb: { width: '100%', height: 160, borderRadius: 8 },
  label: { color: '#9FB0C9', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#22304A', borderRadius: 8, borderWidth: 1, borderColor: '#22304A',
    color: '#FFFFFF', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  hint: { color: '#6B7C97', fontSize: 11, fontWeight: '500', marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { backgroundColor: '#22304A', borderWidth: 1, borderColor: '#22304A', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  chipActive: { backgroundColor: '#2E7DFF', borderColor: '#2E7DFF' },
  chipText: { color: '#9FB0C9', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  metaText: { fontSize: 13, color: '#9FB0C9', fontWeight: '600' },
  progressTrack: { height: 6, backgroundColor: '#22304A', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: '#2E7DFF' },
  formActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  cancelBtn: { flex: 1, backgroundColor: '#22304A', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  cancelBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  confirmBtn: { flex: 1, backgroundColor: '#2E7DFF', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 14, color: '#9FB0C9', fontWeight: '600', textAlign: 'center' },
});
