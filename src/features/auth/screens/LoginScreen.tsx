import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Link } from 'expo-router';
import Constants from 'expo-constants';
import { Button } from '@/components/ui/Button';
import { showAlert } from '@/components/ui/Feedback';
import { isGoogleAuthLive } from '@/lib/config';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { isSignInCancelled } from '@/features/auth/api/authApi';
import { AuthCard, AuthLayout } from '@/features/auth/components/AuthLayout';
import { CodeStep, EmailStep, isValidEmail } from '@/features/auth/components/EmailCodeForm';
import { useAuth } from '@/features/auth/hooks/useAuth';

// Sign-in choices: guest, Google, or an emailed code. There is no separate sign-up: each choice
// creates the account if it does not exist. Guests can browse; joining, watching and buying need a
// saved account (enforced in the database). Every new account then passes the 18+ gate and policy
// acceptance (complete-profile).
//
// None of the handlers navigate: the auth listener fires and the root layout routes. Pushing a
// route here as well would race it.

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

type Step = 'choose' | 'email' | 'code';
type BusyAction = 'guest' | 'google' | 'email' | 'code';

export default function LoginScreen() {
  const { sendEmailCode, verifyEmailCode, signInWithGoogle, signInAsGuest } = useAuth();

  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<BusyAction | null>(null);

  /** Runs one sign-in action with its button showing a spinner and the others disabled. */
  async function run(
    action: BusyAction,
    work: () => Promise<void>,
    failure: { title: string; fallback?: string; ignore?: (err: unknown) => boolean },
  ) {
    setBusy(action);
    try {
      await work();
    } catch (err) {
      if (!failure.ignore?.(err)) {
        showAlert(
          failure.title,
          (err as Error)?.message || failure.fallback || 'Please try again.',
        );
      }
    } finally {
      setBusy(null);
    }
  }

  const continueAsGuest = () =>
    run('guest', signInAsGuest, { title: 'Could not continue as guest' });

  // Backing out of Google's account picker is a choice, not a failure worth a dialog.
  const continueWithGoogle = () =>
    run('google', signInWithGoogle, { title: 'Google sign-in failed', ignore: isSignInCancelled });

  const sendCode = () => {
    if (!isValidEmail(email)) {
      showAlert('Check your email', 'Enter a valid email address.');
      return;
    }
    run(
      'email',
      async () => {
        await sendEmailCode(email);
        setStep('code');
      },
      { title: 'Could not send code' },
    );
  };

  const submitCode = () => {
    if (code.trim().length < 6) {
      showAlert('Check the code', 'Enter the 6-digit code from your email.');
      return;
    }
    run('code', () => verifyEmailCode(email, code), {
      title: 'That code did not work',
      fallback: 'It may have expired. Send a new one.',
    });
  };

  return (
    <AuthLayout tagline="Your cloud. Your channels.">
      {step === 'choose' && (
        <AuthCard title="Get started" subtitle="One tap. No password to remember.">
          <Button
            label="Continue as guest"
            icon="compass"
            size="lg"
            onPress={continueAsGuest}
            busy={busy === 'guest'}
            disabled={busy !== null}
          />
          <Text style={styles.helper}>
            We create a guest ID for you. Save it later with Google or email.
          </Text>

          {isGoogleAuthLive() && (
            <Button
              label="Sign in with Google"
              icon="globe"
              variant="secondary"
              size="lg"
              onPress={continueWithGoogle}
              busy={busy === 'google'}
              disabled={busy !== null}
              style={styles.choice}
            />
          )}
          <Button
            label="Continue with email"
            icon="mail"
            variant="secondary"
            size="lg"
            onPress={() => setStep('email')}
            disabled={busy !== null}
            style={styles.choice}
          />
        </AuthCard>
      )}

      {step === 'email' && (
        <AuthCard title="What's your email?" subtitle="We'll send a 6-digit code. No password.">
          <EmailStep
            email={email}
            onChangeEmail={setEmail}
            onSubmit={sendCode}
            onBack={() => setStep('choose')}
            sending={busy === 'email'}
            disabled={busy !== null}
          />
        </AuthCard>
      )}

      {step === 'code' && (
        <AuthCard title="Enter the code" subtitle={`Sent to ${email.trim()}`}>
          <CodeStep
            code={code}
            onChangeCode={setCode}
            onSubmit={submitCode}
            submitLabel="Sign in"
            submitting={busy === 'code'}
            disabled={busy !== null}
            onResend={sendCode}
            onUseDifferentEmail={() => {
              setCode('');
              setStep('email');
            }}
          />
        </AuthCard>
      )}

      <Text style={styles.legal}>
        By continuing you agree to the Cloudlynk{' '}
        <Link href="/terms" style={styles.legalLink}>
          Terms &amp; Conditions
        </Link>{' '}
        and{' '}
        <Link href="/privacy" style={styles.legalLink}>
          Privacy Policy
        </Link>
        .
      </Text>
      <Text style={styles.version}>v{APP_VERSION}</Text>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  helper: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  choice: { marginTop: Spacing.md },
  legal: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.xl,
    lineHeight: 19,
    paddingHorizontal: Spacing.sm,
  },
  legalLink: { color: Colors.brandBlue, fontWeight: FontWeight.semibold },
  version: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
