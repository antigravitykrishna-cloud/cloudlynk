import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { showAlert } from '@/components/ui/Feedback';
import { pickVideoFiles } from '@/lib/mediaPicker';
import { Colors, Radius, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatBytes } from '@/utils/format';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { adminChannelsApi } from '@/features/admin/api/adminChannelsApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { postsApi } from '@/features/content/api/postsApi';
import { streamUploadApi, type VideoMeta } from '@/features/upload/api/streamUploadApi';
import { VideoDetailsFields } from '@/features/upload/components/VideoDetailsFields';
import { blankDetails, finalizeDetails } from '@/features/upload/newUploads';
import { toNewPost } from '@/features/upload/toNewPost';

// An admin upload into the official channel, through the same pipeline as every upload:
// Cloudflare Stream (streamUploadApi), then the post (postsApi.create).

export default function AdminUploadScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [channel, setChannel] = useState<{ id: string; name: string } | null>(null);
  const [channelLoading, setChannelLoading] = useState(true);
  const [video, setVideo] = useState<VideoMeta | null>(null);
  const [details, setDetails] = useState(blankDetails);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    adminChannelsApi
      .getOfficial()
      .then(setChannel)
      .catch(err => __DEV__ && console.error('AdminUpload channel error:', err))
      .finally(() => setChannelLoading(false));
  }, []);

  async function chooseVideo() {
    try {
      const [picked] = await pickVideoFiles({ multiple: false });
      if (picked) setVideo(picked);
    } catch (err) {
      showAlert('Could not pick video', errorMessage(err, 'Please try again.'));
    }
  }

  function problem(): [string, string] | null {
    if (!channel)
      return ['No official channel', 'The Cloudlynk Official channel does not exist yet.'];
    if (!profile) return ['Not signed in', 'Please sign in again.'];
    if (!details.title.trim()) return ['Title required', 'Give this content a title.'];
    if (!video && details.contentType !== 'post')
      return ['Video required', 'Pick a video file to upload.'];
    return null;
  }

  async function submit(saveAsDraft: boolean) {
    const issue = problem();
    if (issue) {
      showAlert(...issue);
      return;
    }
    setSubmitting(true);
    setProgress(0);
    try {
      const streamVideoUid = video
        ? await streamUploadApi.upload(video, setProgress, { channelId: channel!.id })
        : undefined;
      await postsApi.create(
        toNewPost(
          finalizeDetails(details, channel!.id),
          { channelId: channel!.id, authorId: profile!.id, streamVideoUid },
          { saveAsDraft },
        ),
      );
      showAlert(
        saveAsDraft ? 'Saved as draft' : 'Published',
        saveAsDraft
          ? 'You can publish it from the Content screen when you are ready.'
          : 'It is live now.',
        [{ text: 'OK', onPress: () => router.replace('/admin/content') }],
      );
    } catch (err) {
      showAlert('Upload failed', errorMessage(err, 'Something went wrong.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminScreen title="Upload">
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={adminStyles.list} keyboardShouldPersistTaps="handled">
          {channelLoading ? (
            <ActivityIndicator color={Colors.brandBlue} style={styles.spinner} />
          ) : !channel ? (
            <Card>
              <Text style={adminStyles.muted}>
                The Cloudlynk Official channel does not exist yet. It is created by the v56
                migration once an admin profile exists.
              </Text>
            </Card>
          ) : (
            <>
              <Text style={adminStyles.muted}>Publishing to {channel.name}.</Text>

              <Card style={styles.section}>
                <Button
                  label={video ? `${video.name} (${formatBytes(video.size)})` : 'Pick video file'}
                  variant="secondary"
                  onPress={chooseVideo}
                  disabled={submitting}
                />
              </Card>

              <Card>
                <VideoDetailsFields
                  details={details}
                  onChange={patch => setDetails(current => ({ ...current, ...patch }))}
                  fileName={video?.name ?? 'Title'}
                />
                <Text style={adminStyles.muted}>
                  You can change the access level later from the Content screen.
                </Text>
              </Card>

              {submitting && video ? (
                <Card>
                  <Text style={adminStyles.muted}>Uploading… {Math.round(progress * 100)}%</Text>
                  <View style={styles.progressTrack}>
                    <View
                      style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
                    />
                  </View>
                </Card>
              ) : null}

              <View style={styles.actions}>
                <Button
                  label="Save as draft"
                  variant="secondary"
                  onPress={() => submit(true)}
                  disabled={submitting}
                  style={styles.action}
                />
                <Button
                  label="Publish"
                  onPress={() => submit(false)}
                  busy={submitting}
                  style={styles.action}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  spinner: { marginTop: 30 },
  section: { marginTop: Spacing.md },
  progressTrack: {
    height: 6,
    borderRadius: Radius.xs,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  progressFill: { height: 6, backgroundColor: Colors.brandBlue },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  action: { flex: 1 },
});
