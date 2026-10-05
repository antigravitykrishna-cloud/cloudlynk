import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, TextButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { formatBytes } from '@/utils/format';
import { VideoDetailsFields } from '@/features/upload/components/VideoDetailsFields';
import { useUploadQueue, type QueueItem } from '@/features/upload/hooks/useUploadQueue';
import type { VideoDetails } from '@/features/upload/uploadQueue';
import { errorMessage } from '@/utils/errors';

// Edit a queued video's details before it uploads. "Save & next" moves on to the next video still
// waiting, so a batch can be filled in one after another.

export default function UploadFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queue = useUploadQueue(undefined);
  const item = queue.items.find(i => i.id === id);

  if (!item) {
    return (
      <SafeAreaView style={styles.page} edges={['top']}>
        <ScreenHeader title="Edit Item" />
        <EmptyState
          icon="folder"
          title="Item not found in queue."
          action={{ label: 'Back to Queue', onPress: () => router.replace('/upload/queue') }}
        />
      </SafeAreaView>
    );
  }

  // Keyed by item, so moving on to the next video starts a fresh form even if the screen is reused.
  return <QueuedItemForm key={item.id} item={item} queue={queue} />;
}

function QueuedItemForm({
  item,
  queue,
}: {
  item: QueueItem;
  queue: ReturnType<typeof useUploadQueue>;
}) {
  const router = useRouter();
  const [details, setDetails] = useState<VideoDetails>(() => ({
    ...item,
    title: item.title || item.video.name,
  }));
  const [saving, setSaving] = useState(false);

  const goToNextQueued = () => {
    const index = queue.items.findIndex(i => i.id === item.id);
    const next = queue.items.slice(index + 1).find(i => i.status === 'queued');
    if (next) router.replace({ pathname: '/upload/form/[id]', params: { id: next.id } });
    else router.replace('/upload/queue');
  };

  async function save() {
    setSaving(true);
    try {
      await queue.update(item.id, {
        title: details.title.trim(),
        body: details.body.trim(),
        contentType: details.contentType,
        accessLevel: details.accessLevel,
        genre: details.genre,
        durationMin: details.durationMin,
        seasonNo: details.seasonNo,
        episodeNo: details.episodeNo,
        episodeTitle: details.episodeTitle,
        releaseYear: details.releaseYear,
        thumbnailUri: details.thumbnailUri,
      });
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  }

  const saveAndNext = async () => {
    await save();
    goToNextQueued();
  };

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScreenHeader
        title="Edit Details"
        right={<TextButton label="Save & next" onPress={saveAndNext} disabled={saving} />}
      />
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <FileSummary item={item} />
          <VideoDetailsFields
            details={details}
            onChange={patch => setDetails(current => ({ ...current, ...patch }))}
            fileName={item.video.name}
            showSeriesName={false}
          />
          <View style={styles.actions}>
            <Button
              label="Skip for now"
              variant="secondary"
              onPress={goToNextQueued}
              style={styles.action}
            />
            <Button label="Save" onPress={save} busy={saving} style={styles.action} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FileSummary({ item }: { item: QueueItem }) {
  return (
    <View style={styles.file}>
      <Icon name="film" size={16} color={Colors.textMuted} />
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {item.video.name}
        </Text>
        <Text style={styles.fileSize}>{formatBytes(item.video.size)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  fileInfo: { flex: 1 },
  fileName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  fileSize: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  action: { flex: 1 },
});
