import { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, TextButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { Colors, Radius, Spacing } from '@/theme';
import { authApi } from '@/features/auth/api/authApi';
import { AuthCard, AuthLayout } from '@/features/auth/components/AuthLayout';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { MIN_PASSWORD_LENGTH } from '@/features/auth/signupValidation';
import { errorMessage } from '@/utils/errors';

// Password recovery, step 2, opened by the cloudlynk://reset-password link in the email. The link
// creates a short-lived recovery session; without it the link has expired. Requires
// cloudlynk://reset-password in Supabase -> Authentication -> URL Configuration -> Redirect URLs.

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setError(null);
  };

  async function submit() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Checked on submit rather than on mount: the recovery session can arrive a moment after the
      // deep link opens the screen, and checking early would reject a good link on a slow network.
      if (!(await authApi.getSession())) {
        setError(
          'This reset link has expired or was already used. Request a new one from the sign-in screen.',
        );
        return;
      }
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, 'Could not set your password. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <AuthLayout showBrand={false}>
        <AuthCard
          icon="check-circle"
          title="Password updated"
          subtitle="You're signed in with your new password. Other devices have been signed out."
        >
          <Button
            label="Start browsing"
            size="lg"
            pill
            onPress={() => router.replace('/(tabs)/explore')}
          />
        </AuthCard>
      </AuthLayout>
    );
  }

  const visibilityToggle = (
    <TouchableOpacity
      style={styles.eye}
      onPress={() => setShowPassword(shown => !shown)}
      accessibilityRole="button"
      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
    >
      <Icon name={showPassword ? 'eye-off' : 'eye'} size={19} color={Colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <AuthLayout showBrand={false}>
      <AuthCard
        title="Choose a new password"
        subtitle={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      >
        <TextField
          label="New password"
          value={password}
          onChangeText={edit(setPassword)}
          placeholder="••••••••"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          editable={!saving}
          trailing={visibilityToggle}
        />
        <TextField
          label="Confirm password"
          value={confirm}
          onChangeText={edit(setConfirm)}
          error={error}
          placeholder="••••••••"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          editable={!saving}
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        <Button label="Set new password" size="lg" pill onPress={submit} busy={saving} />
        <TextButton
          label="Back to sign in"
          tone="muted"
          onPress={() => router.replace('/(auth)/login')}
        />
      </AuthCard>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  eye: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
