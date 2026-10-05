import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, TextButton } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { AuthCard, AuthLayout } from '@/features/auth/components/AuthLayout';
import { isValidEmail } from '@/features/auth/components/EmailCodeForm';
import { useAuth } from '@/features/auth/hooks/useAuth';

// Password recovery, step 1: where to send the reset link. The confirmation reads the same whether
// or not the address has an account, so this screen cannot reveal who is registered.

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!isValidEmail(email)) {
      setError('Enter the email address you signed up with.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError((err as Error)?.message ?? 'Could not send the email. Try again in a moment.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout showBrand={false}>
        <AuthCard
          icon="check-circle"
          title="Check your email"
          subtitle={
            <>
              If <Text style={styles.strong}>{email.trim()}</Text> has a Cloudlynk account, a
              password reset link is on its way. It expires in one hour.
            </>
          }
        >
          <Text style={styles.hint}>
            Nothing after a few minutes? Check spam, and make sure you typed the address you signed
            up with.
          </Text>
          <Button
            label="Back to sign in"
            size="lg"
            pill
            onPress={() => router.replace('/(auth)/login')}
          />
        </AuthCard>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout showBrand={false}>
      <AuthCard
        title="Reset your password"
        subtitle="Enter your email and we'll send you a link to set a new password."
      >
        <TextField
          label="Email"
          value={email}
          onChangeText={value => {
            setEmail(value);
            setError(null);
          }}
          error={error}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!sending}
          onSubmitEditing={submit}
          returnKeyType="send"
        />
        <Button label="Send reset link" size="lg" pill onPress={submit} busy={sending} />
        <TextButton label="Back to sign in" tone="muted" onPress={() => router.back()} />
      </AuthCard>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  strong: { color: Colors.text, fontWeight: FontWeight.semibold },
  hint: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    lineHeight: 19,
    marginBottom: Spacing.xl,
  },
});
