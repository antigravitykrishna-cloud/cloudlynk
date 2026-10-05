import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { showAlert, toast } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { pickAvatar } from '@/lib/mediaPicker';
import { publicMedia } from '@/lib/publicMedia';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { profileApi } from '@/features/auth/api/profileApi';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { errorCode, errorMessage } from '@/utils/errors';

// Edit your own name, username and picture. Only these columns are writable: privileged fields
// (plan, admin, approval) are reverted server-side by protect_profile_privileged_fields.

const NAME_MAX = 60;
const USERNAME_MAX = 24;
// Deliberately narrow: a username ends up in URLs and @mentions, so anything outside this set
// would need escaping somewhere later.
const USERNAME_PATTERN = /^[a-z0-9_.]+$/;
/** Postgres unique violation. The only one this form can cause is a taken username. */
const ALREADY_TAKEN = '23505';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [avatarPath, setAvatarPath] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function changePicture() {
    const uri = await pickAvatar();
    if (!uri || !user) return;
    setUploading(true);
    try {
      setAvatarPath(await publicMedia.upload(user.id, uri, 'image'));
      toast('Picture updated — remember to save', 'info');
    } catch (err) {
      showAlert('Upload failed', errorMessage(err, 'Could not upload that image.'));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const name = fullName.trim();
    const handle = username.trim().toLowerCase();
    if (!name) {
      showAlert('Name required', 'Enter the name you want shown on your posts.');
      return;
    }
    if (handle && !USERNAME_PATTERN.test(handle)) {
      showAlert('Invalid username', 'Use lowercase letters, numbers, dots and underscores only.');
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      await profileApi.update(user.id, {
        full_name: name,
        username: handle || null,
        avatar_url: avatarPath,
      });
      await refreshProfile();
      toast('Profile saved', 'success');
      router.back();
    } catch (err) {
      if (errorCode(err) === ALREADY_TAKEN) {
        showAlert('Username taken', `"${handle}" is already in use. Try another.`);
      } else {
        showAlert('Could not save', errorMessage(err, 'Please try again.'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <ScreenHeader title="Edit Profile" fallbackHref="/(tabs)/profile" />
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={styles.avatar}
            onPress={changePicture}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            <Avatar
              uri={avatarPath ? publicMedia.url(avatarPath) : null}
              name={fullName || profile?.email}
              size={104}
              tone="muted"
            />
            <View style={styles.avatarBadge}>
              {uploading ? (
                <ActivityIndicator size="small" color={Colors.textInverse} />
              ) : (
                <Icon name="edit" size={15} color={Colors.textInverse} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Tap to change your picture</Text>

          <TextField
            label="Name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            maxLength={NAME_MAX}
          />
          <TextField
            label="Username"
            value={username}
            onChangeText={text => setUsername(text.toLowerCase().replace(/\s/g, ''))}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={USERNAME_MAX}
            hint="Lowercase letters, numbers, dots and underscores. Optional."
            leading={<Text style={styles.at}>@</Text>}
          />
          <TextField
            label="Email"
            value={profile?.email ?? ''}
            editable={false}
            style={styles.readonly}
            hint="Your sign-in address cannot be changed here. Contact support if you need it moved."
            trailing={<Icon name="lock" size={15} color={Colors.textMuted} />}
          />

          <Button
            label="Save changes"
            size="lg"
            pill
            onPress={save}
            busy={saving}
            disabled={uploading}
            style={styles.save}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: Spacing.xl, paddingBottom: 40 },
  avatar: { alignSelf: 'center', marginTop: Spacing.md },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.bg,
  },
  avatarHint: {
    color: Colors.textMuted,
    fontSize: FontSize.base,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  at: { color: Colors.textMuted, fontSize: FontSize.xl, fontWeight: FontWeight.semibold },
  readonly: { color: Colors.textMuted },
  save: { marginTop: Spacing.xl },
});
