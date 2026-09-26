// Save a guest account (v89) by linking Google or an email to it.
//
// A guest account lives only in this app's storage on this phone: uninstall,
// clear data, change phones or sign out, and it cannot be signed back into --
// with whatever plan was bought on it. Linking keeps the SAME account id, so
// the plan, joined channels and everything else stay exactly as they are;
// nothing is copied or migrated.
//
// Opened from: the banner on Profile, the prompt after a purchase
// (app/premium.tsx, `?reason=purchase`), the guest sign-out warning, and any
// action a guest cannot take (uploads).
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { isGoogleAuthLive } from '../lib/config';
import { showAlert } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

type Mode = 'choose' | 'email' | 'code';

function friendly(err: any): string {
  const msg = String(err?.message ?? '');
  const code = String(err?.code ?? '');
  if (code === 'email_exists' || /already (been )?registered|already exists/i.test(msg)) {
    return 'This email already has a Cloudlynk account. Use a different email, or contact support to move this guest plan to that account.';
  }
  if (code === 'identity_already_exists' || /already linked/i.test(msg)) {
    return 'This Google account already has a Cloudlynk account. Use a different Google account or an email, or contact support to move this guest plan.';
  }
  if (code === 'manual_linking_disabled') {
    return 'Saving with Google is not switched on yet. Please use your email for now.';
  }
  return msg || 'Please try again.';
}

export default function SaveAccountScreen() {
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { profile, isGuest, isPaidUser, linkEmailStart, linkEmailVerify, linkGoogle } = useAuth();

  const [mode, setMode] = useState<Mode>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'google' | 'email' | 'code'>(null);

  const afterPurchase = reason === 'purchase';
  const guestName = profile?.full_name ?? 'Guest';

  const done = () => {
    showAlert('Account saved', 'You can now sign in with it on any phone. Your plan and channels are kept.');
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const leave = () => {
    if (afterPurchase || isPaidUser) {
      showAlert(
        'Your plan is not safe yet',
        'If you uninstall the app, change phones or sign out, this guest account and the plan on it cannot be recovered.',
        [
          { text: 'Save now', style: 'cancel' },
          { text: 'Later', style: 'destructive', onPress: () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/explore')) },
        ],
      );
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/explore');
  };

  async function withGoogle() {
    setBusy('google');
    try {
      await linkGoogle();
      done();
    } catch (err: any) {
      const cancelled = /cancel/i.test(String(err?.message ?? '')) || err?.code === '-5' || err?.code === '12501';
      if (!cancelled) showAlert('Could not save with Google', friendly(err));
    } finally {
      setBusy(null);
    }
  }

  async function sendCode() {
    const addr = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      showAlert('Check your email', 'Enter a valid email address.');
      return;
    }
    setBusy('email');
    try {
      if (await linkEmailStart(addr)) done();
      else setMode('code');
    } catch (err: any) {
      showAlert('Could not send code', friendly(err));
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    if (code.trim().length < 6) {
      showAlert('Check the code', 'Enter the 6-digit code from your email.');
      return;
    }
    setBusy('code');
    try {
      await linkEmailVerify(email, code);
      done();
    } catch (err: any) {
      showAlert('That code did not work', friendly(err));
    } finally {
      setBusy(null);
    }
  }

  if (!isGuest) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Icon name="check-circle" size={40} color={Colors.brandBlue} />
          <Text style={styles.title}>Your account is saved</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/profile')}>
            <Text style={styles.primaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={leave} style={styles.close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.badge}>
            <Icon name="lock" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>
            {afterPurchase ? 'Payment done! Now save your account' : 'Save your account'}
          </Text>
          <Text style={styles.body}>
            You are using a guest ID, <Text style={styles.bold}>{guestName}</Text>.{' '}
            {afterPurchase || isPaidUser
              ? 'Your plan is on this guest account. If you uninstall the app, change phones or sign out, it cannot be recovered.'
              : 'If you uninstall the app, change phones or sign out, a guest account cannot be recovered.'}
            {' '}Save it now. Your plan and channels stay exactly as they are.
          </Text>

          {mode === 'choose' && (
            <>
              {isGoogleAuthLive() && (
                <TouchableOpacity style={styles.primaryBtn} onPress={withGoogle} disabled={busy !== null} activeOpacity={0.85}>
                  {busy === 'google'
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.primaryText}>Save with Google</Text>}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={isGoogleAuthLive() ? styles.secondaryBtn : styles.primaryBtn}
                onPress={() => setMode('email')}
                disabled={busy !== null}
                activeOpacity={0.85}
              >
                <Text style={isGoogleAuthLive() ? styles.secondaryText : styles.primaryText}>Save with email</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'email' && (
            <>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={sendCode} disabled={busy !== null} activeOpacity={0.85}>
                {busy === 'email'
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.primaryText}>Send code</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMode('choose')} style={styles.link}>
                <Text style={styles.linkText}>Back</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'code' && (
            <>
              <Text style={styles.hint}>Enter the 6-digit code we sent to {email.trim()}.</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={t => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                autoFocus
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={verify} disabled={busy !== null} activeOpacity={0.85}>
                {busy === 'code'
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.primaryText}>Save account</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setCode(''); setMode('email'); }} style={styles.link}>
                <Text style={styles.linkText}>Use a different email</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.xl, paddingTop: Spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  close: { alignSelf: 'flex-end', padding: Spacing.xs },
  closeText: { color: Colors.textSecondary, fontSize: 22 },
  badge: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.brandBlue,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: Spacing.lg,
  },
  title: {
    color: Colors.text, fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold,
    textAlign: 'center', marginTop: Spacing.lg,
  },
  body: {
    color: Colors.textSecondary, fontSize: FontSize.lg, lineHeight: 23,
    textAlign: 'center', marginTop: Spacing.md, marginBottom: Spacing.xxl,
  },
  bold: { color: Colors.text, fontWeight: FontWeight.bold },
  hint: { color: Colors.textSecondary, fontSize: FontSize.base, marginBottom: Spacing.sm },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    color: Colors.text, fontSize: FontSize.lg, paddingHorizontal: Spacing.md, paddingVertical: 14,
    marginBottom: Spacing.md,
  },
  codeInput: { letterSpacing: 8, textAlign: 'center', fontSize: FontSize.xxl },
  primaryBtn: {
    backgroundColor: Colors.brandBlue, borderRadius: Radius.lg, paddingVertical: 16,
    alignItems: 'center', marginBottom: Spacing.md, alignSelf: 'stretch',
  },
  primaryText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  secondaryBtn: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
  },
  secondaryText: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  link: { alignItems: 'center', paddingVertical: Spacing.sm },
  linkText: { color: Colors.textSecondary, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
