import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

// Step 1 of password recovery: ask where to send the link.
//
// Before this existed there was no recovery path at all — no link on the login
// screen, no resetPasswordForEmail call anywhere. Anyone who forgot their
// password was permanently locked out and had to be fixed by hand in the
// Supabase dashboard.
//
// The confirmation is deliberately the same whether or not the address has an
// account. A screen that says "no account with that email" is a free tool for
// finding out who has registered.

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const addr = email.trim();
    if (!addr || !addr.includes('@')) {
      setError('Enter the email address you signed up with.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(addr);
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? 'Could not send the email. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.safe}>
        <View style={styles.card}>
          <Text style={styles.tick}>✓</Text>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.body}>
            If <Text style={styles.strong}>{email.trim()}</Text> has a Cloudlynk
            account, a password reset link is on its way. It expires in one hour.
          </Text>
          <Text style={styles.hint}>
            Nothing after a few minutes? Check spam, and make sure you typed the
            address you signed up with.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryTxt}>Back to sign in</Text>
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
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.body}>
            Enter your email and we&apos;ll send you a link to set a new password.
          </Text>

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(v) => { setEmail(v); setError(null); }}
            placeholder="you@example.com"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!busy}
            onSubmitEditing={submit}
            returnKeyType="send"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={submit}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy
              ? <ActivityIndicator color={Colors.textInverse} size="small" />
              : <Text style={styles.primaryTxt}>Send reset link</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
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
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.xxl, margin: Spacing.xl,
    borderWidth: 1, borderColor: Colors.border,
  },
  tick: {
    color: Colors.success, fontSize: 44, textAlign: 'center',
    marginBottom: Spacing.md, fontWeight: FontWeight.bold,
  },
  title: {
    color: Colors.text, fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold, marginBottom: Spacing.sm,
  },
  body: { color: Colors.textSecondary, fontSize: FontSize.lg, lineHeight: 22, marginBottom: Spacing.xl },
  strong: { color: Colors.text, fontWeight: FontWeight.semibold },
  hint: { color: Colors.textMuted, fontSize: FontSize.md, lineHeight: 19, marginBottom: Spacing.xl },
  label: {
    color: Colors.textSecondary, fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold, letterSpacing: 1, marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    color: Colors.text, fontSize: FontSize.lg, marginBottom: Spacing.lg,
  },
  error: { color: Colors.danger, fontSize: FontSize.md, marginBottom: Spacing.md },
  primaryBtn: {
    backgroundColor: Colors.brandBlue, borderRadius: Radius.full,
    paddingVertical: Spacing.lg, alignItems: 'center', marginTop: Spacing.sm,
  },
  primaryTxt: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  btnDisabled: { opacity: 0.6 },
  backLink: {
    color: Colors.textSecondary, fontSize: FontSize.md,
    textAlign: 'center', marginTop: Spacing.xl,
  },
});
