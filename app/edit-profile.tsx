import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StyleSheet as RNStyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { PostService } from '../lib/posts';
import { useAuth } from '../hooks/useAuth';
import { showAlert, toast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

// Editing your own name, username and picture.
//
// This screen replaces an alert that said "Edit profile coming soon." — the
// pencil button on Profile has been a dead end since the app was written, and
// it is the first thing anyone taps after signing up.
//
// Only three columns are writable here. plan_status, is_admin, approval_status
// and the rest are governed by protect_profile_privileged_fields, which
// reverts them for any writer that is not trusted — so a direct update from
// the client cannot escalate anything even if this screen tried.

const NAME_MAX = 60;
const USERNAME_MAX = 24;
// Deliberately narrow: a username ends up in URLs and @mentions, so anything
// outside this set has to be escaped somewhere later.
const USERNAME_RE = /^[a-z0-9_.]+$/;

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const initials = (fullName || profile?.email || '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permission needed', 'Allow photo access to choose a profile picture.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      // Avatars render at 96px at most; full-resolution originals would cost
      // the user's data allowance and their storage quota for nothing.
      quality: 0.7,
    });
    if (res.canceled || !res.assets?.[0]?.uri || !user?.id) return;

    setUploading(true);
    try {
      const path = await PostService.uploadMedia(user.id, res.assets[0].uri, 'image');
      setAvatarUrl(path);
      toast('Picture updated — remember to save', 'info');
    } catch (err: unknown) {
      showAlert('Upload failed', err instanceof Error ? err.message : 'Could not upload that image.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const name = fullName.trim();
    const handle = username.trim().toLowerCase();

    if (!name) { showAlert('Name required', 'Enter the name you want shown on your posts.'); return; }
    if (handle && !USERNAME_RE.test(handle)) {
      showAlert('Invalid username', 'Use lowercase letters, numbers, dots and underscores only.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: name,
          username: handle || null,
          avatar_url: avatarUrl,
        })
        .eq('id', user?.id ?? '');

      if (error) {
        // 23505 is a unique violation — the only one this form can cause is a
        // taken username, so say that rather than showing the constraint name.
        if (error.code === '23505') {
          showAlert('Username taken', `"${handle}" is already in use. Try another.`);
          return;
        }
        throw error;
      }

      await refreshProfile();
      toast('Profile saved', 'success');
      router.back();
    } catch (err: unknown) {
      showAlert('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const avatarSrc = avatarUrl ? PostService.getMediaPublicUrl(avatarUrl) : null;

  return (
    <View style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} activeOpacity={0.7}>
          <Icon name="chevron-right" size={20} color={Colors.brandBlue} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.85}>
            {avatarSrc
              ? <Image source={avatarSrc} style={styles.avatar} contentFit="cover" transition={200} />
              : <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.initials}>{initials}</Text>
                </View>}
            <View style={styles.avatarBadge}>
              {uploading
                ? <ActivityIndicator size="small" color={Colors.textInverse} />
                : <Icon name="edit" size={15} color={Colors.textInverse} />}
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Tap to change your picture</Text>

          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor={Colors.textMuted}
            maxLength={NAME_MAX}
          />

          <Text style={styles.label}>USERNAME</Text>
          <View style={styles.usernameRow}>
            <Text style={styles.at}>@</Text>
            <TextInput
              style={[styles.input, styles.usernameInput]}
              value={username}
              onChangeText={t => setUsername(t.toLowerCase().replace(/\s/g, ''))}
              placeholder="username"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={USERNAME_MAX}
            />
          </View>
          <Text style={styles.hint}>Lowercase letters, numbers, dots and underscores. Optional.</Text>

          <Text style={styles.label}>EMAIL</Text>
          <View style={[styles.input, styles.readonly]}>
            <Text style={styles.readonlyText}>{profile?.email ?? ''}</Text>
            <Icon name="lock" size={15} color={Colors.textMuted} />
          </View>
          <Text style={styles.hint}>
            Your sign-in address cannot be changed here. Contact support if you need it moved.
          </Text>

          <TouchableOpacity
            style={[styles.saveBtn, (saving || uploading) && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving || uploading}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color={Colors.textInverse} />
              : <Text style={styles.saveTxt}>Save changes</Text>}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.surface,
    borderBottomWidth: RNStyleSheet.hairlineWidth, borderBottomColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: 52, paddingBottom: Spacing.lg,
  },
  // The chevron icon points right, so it is flipped to read as "back".
  back: { width: 44, alignItems: 'flex-start', transform: [{ scaleX: -1 }] },
  headerTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.bold },

  body: { padding: Spacing.xl },
  avatarWrap: { alignSelf: 'center', marginTop: Spacing.md },
  avatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: Colors.surfaceElevated },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: Colors.textSecondary, fontSize: 34, fontWeight: FontWeight.bold },
  avatarBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: Colors.bg,
  },
  avatarHint: {
    color: Colors.textMuted, fontSize: FontSize.base,
    textAlign: 'center', marginTop: Spacing.md, marginBottom: Spacing.xl,
  },

  label: {
    color: Colors.textSecondary, fontSize: FontSize.sm,
    fontWeight: FontWeight.bold, letterSpacing: 0.8,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    color: Colors.text, fontSize: FontSize.lg,
  },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  at: { color: Colors.textMuted, fontSize: FontSize.xl, fontWeight: FontWeight.semibold },
  usernameInput: { flex: 1 },
  hint: { color: Colors.textMuted, fontSize: FontSize.md, marginTop: Spacing.sm, lineHeight: 17 },

  readonly: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readonlyText: { color: Colors.textMuted, fontSize: FontSize.lg },

  saveBtn: {
    marginTop: Spacing.xxxl,
    backgroundColor: Colors.brandBlue,
    borderRadius: Radius.full,
    paddingVertical: Spacing.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  saveTxt: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
});
