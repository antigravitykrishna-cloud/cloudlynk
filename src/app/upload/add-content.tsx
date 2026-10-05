/**
 * Upload screen: pick one or more videos, fill in details for each, then "Upload All". Progress is
 * shown in place until every item finishes or fails.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { showAlert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { EntryCard } from '@/components/upload/EntryCard';
import { GenrePickerModal } from '@/components/upload/GenrePickerModal';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { Colors, Radius } from '@/constants/theme';
import { useEntryForms } from '@/hooks/useEntryForms';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { PostService } from '@/lib/data/posts';
import { errorMessage } from '@/lib/errors';
import { StreamService } from '@/lib/video/stream';
import { blankEntry, isFinished, slotsLeft, toQueueEntry } from '@/lib/video/uploadForm';

export default function AddContentScreen() {
  const router = useRouter();
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const { addToQueue, startUpload, items, isUploading, maxItems, queuedCount } =
    useUploadQueue(channelId);
  const { entries, updateEntry, removeEntry, addEntries } = useEntryForms();

  const [picking, setPicking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sessionItemIds, setSessionItemIds] = useState<string[]>([]);
  const [genrePickerFor, setGenrePickerFor] = useState<number | null>(null);
  const [thumbPickingFor, setThumbPickingFor] = useState<number | null>(null);

  const sessionItems = items.filter(i => sessionItemIds.includes(i.id));
  const allDone = sessionItems.length > 0 && sessionItems.every(i => isFinished(i.status));

  const handleAddVideos = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const videos = await StreamService.pickVideos();
      if (!videos.length) return;
      const slots = slotsLeft(videos.length, maxItems, queuedCount, entries.length);
      if (slots === 0) {
        showAlert('Queue full', `Free plan allows up to ${maxItems} videos. Upgrade to add more.`);
        return;
      }
      addEntries(videos.slice(0, slots).map(v => blankEntry(v)));
      if (videos.length > slots) {
        showAlert(
          'Limit reached',
          `${videos.length - slots} file(s) skipped — free plan limit of ${maxItems}.`,
        );
      }
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not pick videos'));
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
    } catch (err) {
      showAlert('Permission required', errorMessage(err));
    } finally {
      setThumbPickingFor(null);
    }
  };

  const handleSubmit = async () => {
    if (!channelId) {
      showAlert('Error', 'No channel selected.');
      return;
    }
    if (entries.length === 0) {
      showAlert('No videos', 'Add at least one video first.');
      return;
    }

    const missingIdx = entries.findIndex(e => !e.title.trim());
    if (missingIdx !== -1) {
      showAlert('Title required', `Please add a title for video ${missingIdx + 1}.`);
      return;
    }

    try {
      const added = await addToQueue(entries.map(e => toQueueEntry(e, channelId)));
      if (added === 0) {
        showAlert('Queue full', 'Could not add videos — queue is at capacity.');
        return;
      }
      setSubmitted(true);
      // The new items' ids are picked up by the effect below once the queue state updates.
      await startUpload();
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Failed to queue uploads'));
    }
  };

  // Capture session item IDs after the queue state updates post-submit
  useEffect(() => {
    if (!submitted || sessionItemIds.length > 0) return;
    const entryTitles = new Set(entries.map(e => e.title.trim()).filter(Boolean));
    const matching = items.filter(
      i =>
        entryTitles.has(i.title) &&
        (i.status === 'queued' ||
          i.status === 'uploading' ||
          i.status === 'done' ||
          i.status === 'failed'),
    );
    if (matching.length > 0) {
      setSessionItemIds(matching.map(i => i.id));
    }
  }, [items, submitted, sessionItemIds.length, entries]);

  const leave = () => {
    if (isUploading) {
      showAlert('Upload in progress', 'Uploads are running. You can leave — they will continue.', [
        { text: 'Stay' },
        { text: 'Leave', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={leave} style={styles.backBtn}>
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

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
          >
            {submitted ? (
              <UploadProgress items={sessionItems} allDone={allDone} isUploading={isUploading} />
            ) : (
              <>
                <TouchableOpacity
                  style={styles.addVideoBtn}
                  onPress={handleAddVideos}
                  disabled={picking}
                  activeOpacity={0.75}
                >
                  {picking ? (
                    <ActivityIndicator color={Colors.brandBlue} size="small" />
                  ) : (
                    <Text style={styles.addVideoBtnTxt}>{'+ Add Videos'}</Text>
                  )}
                </TouchableOpacity>

                {entries.length === 0 && (
                  <View style={styles.empty}>
                    <Icon name="film" size={16} color={Colors.textMuted} />
                    <Text style={styles.emptyTxt}>No videos yet</Text>
                    <Text style={styles.emptySubTxt}>
                      {
                        'Tap "Add Videos" to pick one or more files.\nFor a series, pick all episodes together.'
                      }
                    </Text>
                  </View>
                )}

                {entries.map((entry, idx) => (
                  <EntryCard
                    key={entry.video.uri + idx}
                    entry={entry}
                    index={idx}
                    onChange={patch => updateEntry(idx, patch)}
                    onRemove={() => removeEntry(idx)}
                    onPickGenre={() => setGenrePickerFor(idx)}
                    onPickThumbnail={() => handlePickThumbnail(idx)}
                    thumbBusy={thumbPickingFor === idx}
                    thumbDisabled={thumbPickingFor !== null}
                  />
                ))}

                {entries.length > 0 && (
                  <TouchableOpacity
                    style={styles.addMoreBtn}
                    onPress={handleAddVideos}
                    disabled={picking}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.addMoreBtnTxt}>{'+ Add More Videos'}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <View style={{ height: 60 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <GenrePickerModal
        visible={genrePickerFor !== null}
        selected={genrePickerFor !== null ? entries[genrePickerFor]?.genre : undefined}
        onPick={g => {
          if (genrePickerFor !== null) updateEntry(genrePickerFor, { genre: g });
        }}
        onClose={() => setGenrePickerFor(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 60 },
  backTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  submitBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  submitBtnTxt: { color: Colors.brandBlue, fontSize: 13, fontWeight: '900' },
  body: { flex: 1, paddingHorizontal: 16 },
  addVideoBtn: {
    marginTop: 16,
    borderWidth: 2,
    borderColor: Colors.brandBlue,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    paddingVertical: 18,
    alignItems: 'center',
  },
  addVideoBtnTxt: { color: Colors.brandBlue, fontSize: 15, fontWeight: '800' },
  empty: { alignItems: 'center', paddingTop: 48, paddingBottom: 32 },
  emptyTxt: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  emptySubTxt: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  addMoreBtn: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addMoreBtnTxt: { color: Colors.textMuted, fontSize: 14, fontWeight: '700' },
});
