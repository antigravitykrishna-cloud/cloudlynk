import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { AdminContentService, AdminPost, PostClearableField } from '../../lib/adminContent';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../constants/theme';

// Edit a published post in place.
//
// Why in place and not remove-and-re-upload: content_access_grants rows are
// keyed on post_id. Re-uploading mints a new id, so every individual access
// grant an admin had issued for that post stops applying — the grantee keeps a
// row pointing at nothing, sees nothing, and nobody is told. Editing keeps the
// id, so it keeps the grants.
//
// Not editable here, on purpose:
//   * access_level — has to move Cloudflare's requireSignedURLs flag in step
//     with the database, so it goes through stream-set-access from the content
//     list, not through a form field.
//   * status — admin_set_post_status, also from the content list.
//
// The isAdmin check below is UX. admin_update_post and admin_replace_post_video
// both re-verify is_admin in the database.

/** Mirrors the whitelist in admin_update_post's CASE block. */
const CLEARABLE: Record<string, PostClearableField> = {
  body: 'body',
  genre: 'genre',
  durationMin: 'duration_min',
  releaseYear: 'release_year',
  seasonNumber: 'season_number',
  episodeNumber: 'episode_number',
  episodeTitle: 'episode_title',
  thumbnailUrl: 'thumbnail_url',
};

type Form = {
  title: string;
  body: string;
  genre: string;
  durationMin: string;
  releaseYear: string;
  seasonNumber: string;
  episodeNumber: string;
  episodeTitle: string;
  thumbnailUrl: string;
};

const EMPTY: Form = {
  title: '', body: '', genre: '', durationMin: '', releaseYear: '',
  seasonNumber: '', episodeNumber: '', episodeTitle: '', thumbnailUrl: '',
};

function toForm(p: AdminPost): Form {
  return {
    title: p.title ?? '',
    body: p.body ?? '',
    genre: p.genre ?? '',
    durationMin: p.duration_min != null ? String(p.duration_min) : '',
    releaseYear: '',      // not returned by listPosts; left blank means "leave alone"
    seasonNumber: '',
    episodeNumber: '',
    episodeTitle: '',
    thumbnailUrl: p.thumbnail_url ?? '',
  };
}

/**
 * Defined at module scope, NOT inside the screen.
 *
 * A component declared in the render body is a brand-new component type on
 * every render, so React unmounts and remounts its whole subtree each time
 * state changes. For a TextInput that means the field loses focus after every
 * single keystroke and the form is unusable.
 */
function Field({
  label, value, onChange, placeholder, multiline, numeric, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        multiline={multiline}
        keyboardType={numeric ? 'number-pad' : 'default'}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.headerBack} activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
        <Text style={styles.headerBackTxt}>{'‹'}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 32 }} />
    </View>
  );
}

export default function EditPostScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { postId } = useLocalSearchParams<{ postId: string }>();

  const [post, setPost] = useState<AdminPost | null>(null);
  const [initial, setInitial] = useState<Form>(EMPTY);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newUid, setNewUid] = useState('');
  const [replacing, setReplacing] = useState(false);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      // listPosts is the only admin read that returns the fields this form
      // edits; there is no admin_get_post yet, so filter the list.
      const all = await AdminContentService.listPosts({ status: 'all', accessLevel: 'all' });
      const found = all.find(p => p.id === postId) ?? null;
      setPost(found);
      const f = found ? toForm(found) : EMPTY;
      setInitial(f);
      setForm(f);
    } catch (err: any) {
      showAlert('Could not load', err?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (k: keyof Form) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!post) return;
    if (!form.title.trim()) {
      showAlert('Title required', 'A post needs a title.');
      return;
    }

    // Send only what changed. An unchanged field must stay absent so the RPC's
    // coalesce leaves it alone — sending everything every time would overwrite
    // fields this form cannot even display (release year, season, episode).
    const patch: Parameters<typeof AdminContentService.updatePost>[1] = {};
    const clear: PostClearableField[] = [];

    const numeric = new Set(['durationMin', 'releaseYear', 'seasonNumber', 'episodeNumber']);
    (Object.keys(form) as (keyof Form)[]).forEach(k => {
      const now = form[k].trim();
      const was = initial[k].trim();
      if (now === was) return;

      if (now === '') {
        const col = CLEARABLE[k];
        if (col) clear.push(col);       // title is not clearable; guarded above
        return;
      }
      if (numeric.has(k)) {
        const n = parseInt(now, 10);
        if (Number.isNaN(n)) return;    // silently skip garbage rather than sending NaN
        (patch as any)[k] = n;
      } else {
        (patch as any)[k] = now;
      }
    });

    if (Object.keys(patch).length === 0 && clear.length === 0) {
      showAlert('Nothing to save', 'No fields have changed.');
      return;
    }

    setSaving(true);
    try {
      await AdminContentService.updatePost(post.id, patch, clear.length ? clear : undefined);
      showAlert('Saved', 'The post has been updated.');
      setInitial(form);
    } catch (err: any) {
      showAlert('Could not save', err?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const replaceVideo = () => {
    const uid = newUid.trim();
    if (!post || !uid) return;

    showAlert(
      'Replace the video?',
      post.access_level === 'premium'
        ? 'The new video will be protected on Cloudflare before it replaces the old one. Access grants and the post link are kept. The old video is not deleted.'
        : 'The new video replaces the current one. Access grants and the post link are kept. The old video is not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: async () => {
            setReplacing(true);
            try {
              const { previousUid } = await AdminContentService.replaceVideo(post.id, uid);
              setNewUid('');
              await load();
              showAlert(
                'Video replaced',
                previousUid
                  ? `The post now plays the new video. The old one (${previousUid}) is still on Cloudflare — delete it there once you are sure.`
                  : 'The post now plays the new video.'
              );
            } catch (err: any) {
              showAlert('Could not replace', err?.message ?? 'Something went wrong.');
            } finally {
              setReplacing(false);
            }
          },
        },
      ]
    );
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header title="Edit post" onBack={() => router.back()} />
        <View style={styles.empty}><Text style={styles.emptyTxt}>Access denied</Text></View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header title="Edit post" onBack={() => router.back()} />
        <ActivityIndicator color={Colors.brandBlue} size="large" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header title="Edit post" onBack={() => router.back()} />
        <View style={styles.empty}><Text style={styles.emptyTxt}>Post not found</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Edit post" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.banner}>
            <Text style={styles.bannerTxt}>
              Editing keeps this post&apos;s ID, so everyone you have granted individual
              access to keeps it. Removing and re-uploading would not.
            </Text>
          </View>

          <Text style={styles.section}>Details</Text>
          <Field label="Title" value={form.title} onChange={set('title')} placeholder="Title" />
          <Field label="Description" value={form.body} onChange={set('body')} placeholder="Description" multiline />
          <Field label="Genre" value={form.genre} onChange={set('genre')} placeholder="e.g. Drama" />
          <Field label="Duration (minutes)" value={form.durationMin} onChange={set('durationMin')} placeholder="e.g. 108" numeric />
          <Field
            label="Release year" value={form.releaseYear} onChange={set('releaseYear')}
            placeholder="Leave blank to keep" numeric
            hint="Blank leaves the stored value unchanged."
          />

          {post.content_type === 'series' && (
            <>
              <Text style={styles.section}>Episode</Text>
              <Field label="Season" value={form.seasonNumber} onChange={set('seasonNumber')} placeholder="Leave blank to keep" numeric />
              <Field label="Episode" value={form.episodeNumber} onChange={set('episodeNumber')} placeholder="Leave blank to keep" numeric />
              <Field label="Episode title" value={form.episodeTitle} onChange={set('episodeTitle')} placeholder="Leave blank to keep" />
            </>
          )}

          <Text style={styles.section}>Thumbnail</Text>
          <Field
            label="Thumbnail URL" value={form.thumbnailUrl} onChange={set('thumbnailUrl')}
            placeholder="https://…"
            hint="Clear this field and save to remove the thumbnail."
          />

          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.btnDisabled]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color={Colors.textInverse} size="small" />
              : <Text style={styles.primaryBtnTxt}>Save changes</Text>}
          </TouchableOpacity>

          <View style={styles.divider} />

          <Text style={styles.section}>Replace video</Text>
          <Text style={styles.sectionNote}>
            Current video: <Text style={styles.mono}>{post.video_url ?? 'none'}</Text>
            {post.access_level === 'premium'
              ? '\nThis post is Premium, so the new video is protected on Cloudflare before the swap.'
              : ''}
          </Text>
          <Field
            label="New Cloudflare video ID"
            value={newUid}
            onChange={setNewUid}
            placeholder="Paste the UID from a finished upload"
            hint="Upload the file first, wait for Cloudflare to finish processing, then paste its UID here."
          />
          <TouchableOpacity
            style={[styles.warnBtn, (!newUid.trim() || replacing) && styles.btnDisabled]}
            onPress={replaceVideo}
            disabled={!newUid.trim() || replacing}
            activeOpacity={0.8}
          >
            {replacing
              ? <ActivityIndicator color={Colors.text} size="small" />
              : <Text style={styles.warnBtnTxt}>Replace video</Text>}
          </TouchableOpacity>

          <View style={{ height: Spacing.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerBack: { width: 44 },
  headerBackTxt: { color: Colors.text, fontSize: 28, lineHeight: 30 },
  headerTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  scroll: { padding: Spacing.lg },

  banner: {
    backgroundColor: Colors.accentOrangeDim, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: Colors.accentBorder,
  },
  bannerTxt: { color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 19 },

  section: {
    color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold,
    marginTop: Spacing.lg, marginBottom: Spacing.md,
  },
  sectionNote: { color: Colors.textSecondary, fontSize: FontSize.md, marginBottom: Spacing.md, lineHeight: 19 },
  mono: { color: Colors.brandCyan },

  field: { marginBottom: Spacing.lg },
  label: { color: Colors.textSecondary, fontSize: FontSize.md, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    color: Colors.text, fontSize: FontSize.lg,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  hint: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: Spacing.xs },

  primaryBtn: {
    backgroundColor: Colors.brandBlue, borderRadius: Radius.full,
    paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.md,
  },
  primaryBtnTxt: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  warnBtn: {
    backgroundColor: 'transparent', borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.warning,
    paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.sm,
  },
  warnBtnTxt: { color: Colors.warning, fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  btnDisabled: { opacity: 0.5 },

  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.xxl },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTxt: { color: Colors.textMuted, fontSize: FontSize.lg },
});
