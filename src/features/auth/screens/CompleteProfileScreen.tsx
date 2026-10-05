import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, TextButton } from '@/components/ui/Button';
import { showAlert } from '@/components/ui/Feedback';
import { logRegistration } from '@/lib/metaAds';
import { Colors, FontSize, Spacing } from '@/theme';
import { hasConfirmedAgeOnDevice } from '@/features/auth/components/AgeGate';
import { AuthCard, AuthLayout } from '@/features/auth/components/AuthLayout';
import { PolicyCheckbox } from '@/features/auth/components/PolicyCheckbox';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { errorMessage } from '@/utils/errors';

// Shown after sign-in when the account has no 18+ confirmation or has not accepted the current
// policy versions. A new account on a device that already passed the age gate is completed
// automatically (just a spinner). The card appears when the device has no gate answer, or when the
// policies changed since the account accepted them: a change must be shown, not accepted on the
// person's behalf.
//
// There is no navigation here: the root layout's redirect re-runs once the profile updates.

export default function CompleteProfileScreen() {
  const { user, profile, completeProfile, signOut } = useAuth();
  // Never accepted any version: a new account. Accepted an older one: a returning member who must
  // see the updated policies.
  const isNewAccount = !profile?.terms_accepted_at;
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completingAutomatically, setCompletingAutomatically] = useState(isNewAccount);
  const triedAutomatically = useRef(false);

  async function finish() {
    await completeProfile();
    if (isNewAccount) {
      const method = user?.is_anonymous
        ? 'guest'
        : user?.app_metadata?.provider === 'google'
          ? 'google'
          : 'email';
      logRegistration(method);
    }
  }

  useEffect(() => {
    if (!isNewAccount || triedAutomatically.current) return;
    triedAutomatically.current = true;
    (async () => {
      try {
        if (!(await hasConfirmedAgeOnDevice())) throw new Error('No age answer on this device');
        await finish();
      } catch {
        // Fall back to the card rather than a dead end.
        setCompletingAutomatically(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per new account
  }, [isNewAccount]);

  async function continueWithAgreement() {
    if (!agreed) return;
    setSaving(true);
    try {
      await finish();
    } catch (err) {
      showAlert('Could not continue', errorMessage(err, 'Something went wrong.'));
    } finally {
      setSaving(false);
    }
  }

  if (completingAutomatically) {
    return (
      <View style={styles.spinnerPage}>
        <ActivityIndicator color={Colors.brandBlue} size="large" />
        <Text style={styles.spinnerText}>Setting up your account...</Text>
      </View>
    );
  }

  const welcome = user?.email ? `Welcome, ${user.email}. ` : '';

  return (
    <AuthLayout>
      <AuthCard
        title={isNewAccount ? 'One more step' : 'Our policies changed'}
        subtitle={
          isNewAccount
            ? `${welcome}Please confirm to start using Cloudlynk.`
            : 'Please review and accept the updated policies to continue.'
        }
      >
        <PolicyCheckbox
          checked={agreed}
          onToggle={() => setAgreed(value => !value)}
          prefix="I am 18 or older and agree to the"
        />
        <Button
          label="Continue"
          size="lg"
          onPress={continueWithAgreement}
          busy={saving}
          disabled={!agreed}
        />
        <TextButton
          label="Cancel and sign out"
          tone="muted"
          onPress={() => signOut()}
          disabled={saving}
        />
      </AuthCard>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  spinnerPage: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  spinnerText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
});
