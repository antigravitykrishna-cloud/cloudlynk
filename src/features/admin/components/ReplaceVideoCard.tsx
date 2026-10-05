import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { showAlert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { Colors, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { adminContentApi, type AdminPost } from '@/features/admin/api/adminContentApi';
import { adminStyles } from '@/features/admin/components/adminStyles';

/**
 * Swaps the Cloudflare video behind a post, keeping the post (and its access grants). A premium
 * post's new video is locked before the swap. The old video stays on Cloudflare.
 */
export function ReplaceVideoCard({
  post,
  onReplaced,
}: {
  post: AdminPost;
  onReplaced: () => void;
}) {
  const [uid, setUid] = useState('');
  const [replacing, setReplacing] = useState(false);
  const isPremium = post.access_level === 'premium';

  async function replace() {
    setReplacing(true);
    try {
      const { previousUid } = await adminContentApi.replaceVideo(post.id, uid.trim());
      setUid('');
      onReplaced();
      showAlert(
        'Video replaced',
        previousUid
          ? `The post now plays the new video. The old one (${previousUid}) is still on Cloudflare — delete it there once you are sure.`
          : 'The post now plays the new video.',
      );
    } catch (err) {
      showAlert('Could not replace', errorMessage(err, 'Something went wrong.'));
    } finally {
      setReplacing(false);
    }
  }

  const confirmReplace = () =>
    showAlert(
      'Replace the video?',
      `${isPremium ? 'The new video will be protected on Cloudflare before it replaces the old one. ' : ''}Access grants and the post link are kept. The old video is not deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: replace },
      ],
    );

  return (
    <Card>
      <Text style={[adminStyles.muted, styles.current]}>
        Current video: <Text style={styles.mono}>{post.video_url ?? 'none'}</Text>
        {isPremium
          ? '\nThis post is Premium, so the new video is protected on Cloudflare before the swap.'
          : ''}
      </Text>
      <TextField
        label="New Cloudflare video ID"
        value={uid}
        onChangeText={setUid}
        placeholder="Paste the UID from a finished upload"
        hint="Upload the file first, wait for Cloudflare to finish processing, then paste its UID here."
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        label="Replace video"
        variant="warning"
        onPress={confirmReplace}
        busy={replacing}
        disabled={!uid.trim()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  current: { marginBottom: Spacing.md },
  mono: { fontFamily: 'monospace', color: Colors.text },
});
