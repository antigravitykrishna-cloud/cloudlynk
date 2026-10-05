import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { Colors, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { adminContentApi, type AdminPost } from '@/features/admin/api/adminContentApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { ReplaceVideoCard } from '@/features/admin/components/ReplaceVideoCard';
import { diffPostForm, postToForm, type PostForm } from '@/features/admin/postEdit';

// Edit a post in place. Keeping the post id keeps every access grant on it; removing and
// re-uploading would orphan them. Access level and status change from the content list, where the
// access level is kept in step with Cloudflare.

export default function EditPostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const [post, setPost] = useState<AdminPost | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!postId) return;
    try {
      // There is no single-post admin read yet; the admin list carries every editable field.
      const posts = await adminContentApi.listPosts({ status: 'all', accessLevel: 'all' });
      setPost(posts.find(item => item.id === postId) ?? null);
    } catch (err) {
      showAlert('Could not load', errorMessage(err, 'Something went wrong.'));
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <AdminScreen title="Edit post" fallbackHref="/admin/content">
      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} size="large" style={styles.loading} />
      ) : !post ? (
        <EmptyState icon="film" title="Post not found" />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={adminStyles.list} keyboardShouldPersistTaps="handled">
            <Card style={styles.banner}>
              <Text style={adminStyles.muted}>
                Editing keeps this post&apos;s ID, so everyone you have granted individual access to
                keeps it. Removing and re-uploading would not.
              </Text>
            </Card>
            {/* Keyed by post, so a reload after replacing the video resets the form. */}
            <PostDetailsForm key={post.id + post.video_url} post={post} />
            <Text style={adminStyles.section}>REPLACE VIDEO</Text>
            <ReplaceVideoCard post={post} onReplaced={load} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </AdminScreen>
  );
}

function PostDetailsForm({ post }: { post: AdminPost }) {
  const [initial, setInitial] = useState(() => postToForm(post));
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const field = (key: keyof PostForm) => ({
    value: form[key],
    onChangeText: (text: string) => setForm(current => ({ ...current, [key]: text })),
  });

  async function save() {
    if (!form.title.trim()) {
      showAlert('Title required', 'A post needs a title.');
      return;
    }
    const { patch, clear } = diffPostForm(initial, form);
    if (Object.keys(patch).length === 0 && clear.length === 0) {
      showAlert('Nothing to save', 'No fields have changed.');
      return;
    }
    setSaving(true);
    try {
      await adminContentApi.updatePost(post.id, patch, clear.length ? clear : undefined);
      setInitial(form);
      showAlert('Saved', 'The post has been updated.');
    } catch (err) {
      showAlert('Could not save', errorMessage(err, 'Something went wrong.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Text style={adminStyles.section}>DETAILS</Text>
      <TextField label="Title" placeholder="Title" {...field('title')} />
      <TextField label="Description" placeholder="Description" multiline {...field('body')} />
      <TextField label="Genre" placeholder="e.g. Drama" {...field('genre')} />
      <TextField
        label="Duration (minutes)"
        placeholder="e.g. 108"
        keyboardType="number-pad"
        {...field('durationMin')}
      />
      <TextField
        label="Release year"
        placeholder="Leave blank to keep"
        keyboardType="number-pad"
        hint="Blank leaves the stored value unchanged."
        {...field('releaseYear')}
      />
      {post.content_type === 'series' ? (
        <>
          <Text style={adminStyles.section}>EPISODE</Text>
          <TextField
            label="Season"
            placeholder="Leave blank to keep"
            keyboardType="number-pad"
            {...field('seasonNumber')}
          />
          <TextField
            label="Episode"
            placeholder="Leave blank to keep"
            keyboardType="number-pad"
            {...field('episodeNumber')}
          />
          <TextField
            label="Episode title"
            placeholder="Leave blank to keep"
            {...field('episodeTitle')}
          />
        </>
      ) : null}
      <Text style={adminStyles.section}>THUMBNAIL</Text>
      <TextField
        label="Thumbnail URL"
        placeholder="https://…"
        hint="Clear this field and save to remove the thumbnail."
        autoCapitalize="none"
        {...field('thumbnailUrl')}
      />
      <Button label="Save changes" size="lg" onPress={save} busy={saving} />
    </>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 60 },
  flex: { flex: 1 },
  banner: { backgroundColor: Colors.brandBlueDim, marginBottom: Spacing.sm },
});
