import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { Icon } from '@/components/ui/Icon';

// Password recovery, step 2, opened from the cloudlynk://reset-password link in the email. The link
// creates a short-lived recovery session; without it the link has expired. Requires
// cloudlynk://reset-password in Supabase -> Authentication -> URL Configuration -> Redirect URLs.

const MIN_LENGTH = 8;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Checked here rather than on mount: the recovery session can arrive a
      // moment after the deep link opens the screen, and failing early would
      // reject a perfectly good link on a slow connection.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError(
          'This reset link has expired or was already used. Request a new one from the sign-in screen.',
        );
        return;
      }
      await updatePassword(password);
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? 'Could not set your password. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={styles.safe}>
        <View style={styles.card}>
          <Text style={styles.tick}>✓</Text>
          <Text style={styles.title}>Password updated</Text>
          <Text style={styles.body}>
            You&apos;re signed in with your new password. Other devices have been signed out.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace('/(tabs)/explore')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryTxt}>Start browsing</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.safe}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.body}>At least {MIN_LENGTH} characters.</Text>

          <Text style={styles.label}>NEW PASSWORD</Text>
          <View style={styles.pwRow}>
            <TextInput
              style={styles.pwInput}
              value={password}
              onChangeText={v => {
                setPassword(v);
                setError(null);
              }}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!show}
              autoCapitalize="none"
              editable={!busy}
            />
            <TouchableOpacity
              style={styles.eye}
              onPress={() => setShow(s => !s)}
              activeOpacity={0.7}
            >
              <Icon name={show ? 'eye-off' : 'eye'} size={19} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>CONFIRM PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={v => {
              setConfirm(v);
              setError(null);
            }}
            placeholder="••••••••"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry={!show}
            autoCapitalize="none"
            editable={!busy}
            onSubmitEditing={submit}
            returnKeyType="done"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={submit}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color={Colors.textInverse} size="small" />
            ) : (
              <Text style={styles.primaryTxt}>Set new password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} activeOpacity={0.7}>
            <Text style={styles.backLink}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    margin: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tick: {
    color: Colors.success,
    fontSize: 44,
    textAlign: 'center',
    marginBottom: Spacing.md,
    fontWeight: FontWeight.bold,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  body: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.text,
    fontSize: FontSize.lg,
    marginBottom: Spacing.lg,
  },
  pwRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  pwInput: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.text,
    fontSize: FontSize.lg,
  },
  eye: {
    marginLeft: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  error: { color: Colors.danger, fontSize: FontSize.md, marginBottom: Spacing.md, lineHeight: 19 },
  primaryBtn: {
    backgroundColor: Colors.brandBlue,
    borderRadius: Radius.full,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  primaryTxt: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  btnDisabled: { opacity: 0.6 },
  backLink: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});
