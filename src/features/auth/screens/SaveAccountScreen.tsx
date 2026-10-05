import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { showAlert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { isGoogleAuthLive } from '@/lib/config';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { isSignInCancelled } from '@/features/auth/api/authApi';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { CodeStep, EmailStep, isValidEmail } from '@/features/auth/components/EmailCodeForm';
import { useAuth } from '@/features/auth/hooks/useAuth';

// Saves a guest account by linking Google or an email. A guest account cannot be signed back into
// after uninstalling or signing out; linking keeps the same account id, so the plan and channels
// stay. Opened from the Profile banner, after a purchase (?reason=purchase), before subscribing
// (?reason=subscribe) and from the guest sign-out warning.

type Step = 'choose' | 'email' | 'code';
type BusyAction = 'google' | 'email' | 'code';

/** Explains the linking errors a person can act on; anything else keeps the server's message. */
function linkErrorMessage(err: unknown): string {
  const { message, code } = (err ?? {}) as { message?: unknown; code?: unknown };
  const text = String(message ?? '');
  if (code === 'email_exists' || /already (been )?registered|already exists/i.test(text)) {
    return 'This email already has a Cloudlynk account. Use a different email, or contact support to move this guest plan to that account.';
  }
  if (code === 'identity_already_exists' || /already linked/i.test(text)) {
    return 'This Google account already has a Cloudlynk account. Use a different Google account or an email, or contact support to move this guest plan.';
  }
  if (code === 'manual_linking_disabled') {
    return 'Saving with Google is not switched on yet. Please use your email for now.';
  }
  return text || 'Please try again.';
}

export default function SaveAccountScreen() {
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { profile, isGuest, isPaidUser, linkEmail, confirmLinkedEmail, linkGoogle } = useAuth();

  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<BusyAction | null>(null);

  const afterPurchase = reason === 'purchase';
  const beforeSubscribing = reason === 'subscribe';
  const hasPlanAtRisk = afterPurchase || isPaidUser;

  const close = (fallback: '/(tabs)/profile' | '/(tabs)/explore') =>
    router.canGoBack() ? router.back() : router.replace(fallback);

  const saved = () => {
    showAlert(
      'Account saved',
      'You can now sign in with it on any phone. Your plan and channels are kept.',
    );
    close('/(tabs)/profile');
  };

  const leave = () => {
    if (!hasPlanAtRisk) {
      close('/(tabs)/explore');
      return;
    }
    showAlert(
      'Your plan is not safe yet',
      'If you uninstall the app, change phones or sign out, this guest account and the plan on it cannot be recovered.',
      [
        { text: 'Save now', style: 'cancel' },
        { text: 'Later', style: 'destructive', onPress: () => close('/(tabs)/explore') },
      ],
    );
  };

  async function run(action: BusyAction, work: () => Promise<void>, failureTitle: string) {
    setBusy(action);
    try {
      await work();
    } catch (err) {
      if (!(action === 'google' && isSignInCancelled(err))) {
        showAlert(failureTitle, linkErrorMessage(err));
      }
    } finally {
      setBusy(null);
    }
  }

  const saveWithGoogle = () =>
    run(
      'google',
      async () => {
        await linkGoogle();
        saved();
      },
      'Could not save with Google',
    );

  const sendCode = () => {
    if (!isValidEmail(email)) {
      showAlert('Check your email', 'Enter a valid email address.');
      return;
    }
    run(
      'email',
      async () => {
        if (await linkEmail(email)) saved();
        else setStep('code');
      },
      'Could not send code',
    );
  };

  const confirmCode = () => {
    if (code.trim().length < 6) {
      showAlert('Check the code', 'Enter the 6-digit code from your email.');
      return;
    }
    run(
      'code',
      async () => {
        await confirmLinkedEmail(email, code);
        saved();
      },
      'That code did not work',
    );
  };

  if (!isGuest) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Icon name="check-circle" size={40} color={Colors.brandBlue} />
          <Text style={styles.title}>Your account is saved</Text>
          <Button label="Done" size="lg" onPress={() => router.replace('/(tabs)/profile')} />
        </View>
      </SafeAreaView>
    );
  }

  const title = afterPurchase
    ? 'Payment done! Now save your account'
    : beforeSubscribing
      ? 'Save your account to subscribe'
      : 'Save your account';

  const risk = hasPlanAtRisk
    ? 'Your plan is on this guest account. If you uninstall the app, change phones or sign out, it cannot be recovered.'
    : beforeSubscribing
      ? 'Plans are bought on a saved account, so they are never lost if you uninstall the app or change phones.'
      : 'If you uninstall the app, change phones or sign out, a guest account cannot be recovered.';

  return (
    <SafeAreaView style={styles.safe}>
      <AuthLayout showBrand={false}>
        <TouchableOpacity
          onPress={leave}
          style={styles.close}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.badge}>
          <Icon name="lock" size={26} color={Colors.text} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>
          You are using a guest ID, <Text style={styles.bold}>{profile?.full_name ?? 'Guest'}</Text>
          . {risk} Save it now. Your plan and channels stay exactly as they are.
        </Text>

        {step === 'choose' && (
          <>
            {isGoogleAuthLive() && (
              <Button
                label="Save with Google"
                size="lg"
                onPress={saveWithGoogle}
                busy={busy === 'google'}
                disabled={busy !== null}
                style={styles.choice}
              />
            )}
            <Button
              label="Save with email"
              size="lg"
              variant={isGoogleAuthLive() ? 'secondary' : 'primary'}
              onPress={() => setStep('email')}
              disabled={busy !== null}
              style={styles.choice}
            />
          </>
        )}

        {step === 'email' && (
          <EmailStep
            email={email}
            onChangeEmail={setEmail}
            onSubmit={sendCode}
            onBack={() => setStep('choose')}
            sending={busy === 'email'}
            disabled={busy !== null}
          />
        )}

        {step === 'code' && (
          <>
            <Text style={styles.hint}>Enter the 6-digit code we sent to {email.trim()}.</Text>
            <CodeStep
              code={code}
              onChangeCode={setCode}
              onSubmit={confirmCode}
              submitLabel="Save account"
              submitting={busy === 'code'}
              disabled={busy !== null}
              onUseDifferentEmail={() => {
                setCode('');
                setStep('email');
              }}
            />
          </>
        )}
      </AuthLayout>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  close: { alignSelf: 'flex-end', padding: Spacing.xs },
  closeText: { color: Colors.textSecondary, fontSize: FontSize.xxl },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: Spacing.lg,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extrabold,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  body: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  bold: { color: Colors.text, fontWeight: FontWeight.bold },
  hint: { color: Colors.textSecondary, fontSize: FontSize.base, marginBottom: Spacing.sm },
  choice: { marginBottom: Spacing.md },
});
