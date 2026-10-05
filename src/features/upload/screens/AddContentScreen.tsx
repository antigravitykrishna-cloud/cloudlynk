import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, TextButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { formatBytes } from '@/utils/format';
import { UploadProgress } from '@/features/upload/components/UploadProgress';
import { VideoDetailsFields } from '@/features/upload/components/VideoDetailsFields';
import { useNewUploads } from '@/features/upload/hooks/useNewUploads';
import type { NewUpload } from '@/features/upload/newUploads';

// Pick one or more videos, fill in each one's details, then "Upload All". Progress shows here
// until every upload finishes or fails; uploads carry on if the screen is left.

export default function AddContentScreen() {
  const router = useRouter();
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const form = useNewUploads(channelId);

  const leave = () => {
    if (!form.isUploading) {
      router.back();
      return;
    }
    showAlert('Upload in progress', 'Uploads are running. You can leave — they will continue.', [
      { text: 'Stay' },
      { text: 'Leave', onPress: () => router.back() },
    ]);
  };

  const headerAction = !form.submitted ? (
    <TextButton label="Upload All" onPress={form.submit} disabled={form.uploads.length === 0} />
  ) : form.allFinished ? (
    <TextButton label="Done" onPress={() => router.back()} />
  ) : (
    <ActivityIndicator color={Colors.brandBlue} size="small" />
  );

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScreenHeader title="Add Content" onBack={leave} right={headerAction} />
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {form.submitted ? (
            <Card>
              <Text style={styles.progressTitle}>
                {form.allFinished
                  ? '✓ All uploads complete'
                  : form.isUploading
                    ? 'Uploading…'
                    : 'Queued'}
              </Text>
              {form.submittedItems.map((item, index) => (
                <View key={item.id} style={styles.progressRow}>
                  <Text style={styles.progressName} numberOfLines={1}>
                    {item.title || `Video ${index + 1}`}
                  </Text>
                  <UploadProgress progress={item.progress} status={item.status} />
                  {item.error ? <Text style={styles.progressError}>{item.error}</Text> : null}
                </View>
              ))}
            </Card>
          ) : (
            <>
              <Button
                label="+ Add Videos"
                variant="outline"
                size="lg"
                onPress={form.pickVideos}
                busy={form.picking}
                style={styles.dashed}
              />

              {form.uploads.length === 0 ? (
                <EmptyState
                  icon="film"
                  title="No videos yet"
                  message={
                    'Tap "Add Videos" to pick one or more files.\nFor a series, pick all episodes together.'
                  }
                />
              ) : (
                <>
                  {form.uploads.map((upload, index) => (
                    <UploadEntry
                      key={upload.video.uri + index}
                      upload={upload}
                      number={index + 1}
                      onChange={patch => form.update(index, patch)}
                      onRemove={() => form.remove(index)}
                    />
                  ))}
                  <Button
                    label="+ Add More Videos"
                    variant="secondary"
                    onPress={form.pickVideos}
                    disabled={form.picking}
                    style={styles.dashed}
                  />
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function UploadEntry({
  upload,
  number,
  onChange,
  onRemove,
}: {
  upload: NewUpload;
  number: number;
  onChange: (patch: Partial<NewUpload>) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.entry}>
      <View style={styles.entryHeader}>
        <Text style={styles.entryNumber}>#{number}</Text>
        <View style={styles.entryFile}>
          <Text style={styles.entryFileName} numberOfLines={1}>
            {upload.video.name}
          </Text>
          <Text style={styles.entryFileSize}>{formatBytes(upload.video.size)}</Text>
        </View>
        <TouchableOpacity
          onPress={onRemove}
          style={styles.remove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${upload.video.name}`}
        >
          <Text style={styles.removeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <VideoDetailsFields details={upload} onChange={onChange} fileName={upload.video.name} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingBottom: 60 },
  dashed: { borderStyle: 'dashed', marginBottom: Spacing.lg },
  progressTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  progressRow: { marginBottom: Spacing.md },
  progressName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  progressError: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    marginTop: Spacing.xs,
    fontWeight: FontWeight.semibold,
  },
  entry: {
    paddingBottom: Spacing.lg,
    marginBottom: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.md,
  },
  entryNumber: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.extrabold,
    color: Colors.brandBlue,
    width: 24,
  },
  entryFile: { flex: 1 },
  entryFileName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  entryFileSize: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  remove: { padding: 6 },
  removeText: { color: Colors.textMuted, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
});
