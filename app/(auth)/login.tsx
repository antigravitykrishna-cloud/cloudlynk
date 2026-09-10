import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { showAlert } from '../../components/Feedback';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { isGoogleAuthLive } from '../../lib/config';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import Constants from 'expo-constants';
import { Icon } from '../../components/Icon';

// One-tap entry: guest, Google, or an emailed code. No password field, no
// name field.
//
// Three things this screen deliberately does NOT do:
//
//   * Guest is not Supabase anonymous auth. It simply enters the app with no
//     session, which is what "guest" has meant since v61 and what the whole
//     anon RLS layer (channel_posts_select_anon, the column grant that
//     withholds video_url) is built around. signInAnonymously would hand a
//     guest the `authenticated` role and a profile row, silently promoting
//     them past every policy written for anon — a security change wearing a
//     login button's clothes.
//
//   * It does not collect a name. handle_new_user is happy with none, and
//     nothing in the app requires one.
//
//   * It does not skip the age gate. A new account still lands on
//     complete-profile for birth year and policy acceptance (app/_layout.tsx),
//     because 18+ verification is a Play content-rating requirement, not a
//     signup formality.
//
// The old email+password path is still reachable at /(auth)/signup for
// accounts that already have a password.

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

type Mode = 'choose' | 'email' | 'code';

export default function LoginScreen() {
  const { sendEmailCode, verifyEmailCode, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'guest' | 'google' | 'email' | 'code'>(null);

  const googleAvailable = isGoogleAuthLive();

  function continueAsGuest() {
    setBusy('guest');
    // No await and no network call — there is nothing to sign in to. Straight
    // to the content surface, same destination app/_layout.tsx sends a
    // session-less launch to.
    router.replace('/(tabs)/explore');
  }

  async function handleGoogle() {
    setBusy('google');
    try {
      await signInWithGoogle();
      // No navigation here: the auth state listener in useAuth fires and
      // app/_layout.tsx routes to complete-profile or the tabs. Pushing a
      // route as well would race it.
    } catch (err: any) {
      // The user backing out of the account picker is a cancellation, not a
      // failure — an error dialog for it reads as a bug.
      const msg = String(err?.message ?? '');
      const cancelled = /cancel/i.test(msg) || err?.code === '-5' || err?.code === '12501';
      if (!cancelled) showAlert('Google sign-in failed', msg || 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function requestCode() {
    const addr = email.trim();
    if (!addr || !addr.includes('@')) {
      showAlert('Check your email', 'Enter a valid email address.');
      return;
    }
    setBusy('email');
    try {
      await sendEmailCode(addr);
      setMode('code');
    } catch (err: any) {
      showAlert('Could not send code', err?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function submitCode() {
    if (code.trim().length < 6) {
      showAlert('Check the code', 'Enter the 6-digit code from your email.');
      return;
    }
    setBusy('code');
    try {
      await verifyEmailCode(email, code);
      // Routing is handled by the auth listener, as above.
    } catch (err: any) {
      showAlert('That code did not work', err?.message ?? 'It may have expired. Send a new one.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoRow}>
          <Text style={styles.logo}>☁</Text>
          <Text style={styles.logoText}>
            Cloud<Text style={{ color: Colors.accent }}>lynk</Text>
          </Text>
        </View>
        <Text style={styles.tagline}>Your cloud. Your channels.</Text>

        <View style={styles.card}>
          {mode === 'choose' && (
            <>
              <Text style={styles.heading}>Get started</Text>
              <Text style={styles.subheading}>One tap. No password to remember.</Text>

              <TouchableOpacity
                style={[styles.primaryBtn, busy === 'guest' && styles.btnDisabled]}
                onPress={continueAsGuest}
                disabled={busy !== null}
                activeOpacity={0.85}
              >
                <Icon name="compass" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Continue as guest</Text>
              </TouchableOpacity>
              <Text style={styles.helper}>Browse channels and free content. No account needed.</Text>

              {googleAvailable && (
                <TouchableOpacity
                  style={[styles.secondaryBtn, busy === 'google' && styles.btnDisabled]}
                  onPress={handleGoogle}
                  disabled={busy !== null}
                  activeOpacity={0.85}
                >
                  {busy === 'google'
                    ? <ActivityIndicator color={Colors.text} />
                    : <>
                        <Icon name="globe" size={18} color={Colors.text} />
                        <Text style={styles.secondaryBtnText}>Sign in with Google</Text>
                      </>}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setMode('email')}
                disabled={busy !== null}
                activeOpacity={0.85}
              >
                <Icon name="mail" size={18} color={Colors.text} />
                <Text style={styles.secondaryBtnText}>Continue with email</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'email' && (
            <>
              <Text style={styles.heading}>What's your email?</Text>
              <Text style={styles.subheading}>We'll send a 6-digit code. No password.</Text>

              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={busy === null}
                onSubmitEditing={requestCode}
                returnKeyType="send"
              />

              <TouchableOpacity
                style={[styles.primaryBtn, busy === 'email' && styles.btnDisabled]}
                onPress={requestCode}
                disabled={busy !== null}
                activeOpacity={0.85}
              >
                {busy === 'email'
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.primaryBtnText}>Send code</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setMode('choose')} disabled={busy !== null}>
                <Text style={styles.linkBack}>‹ Back</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'code' && (
            <>
              <Text style={styles.heading}>Enter the code</Text>
              <Text style={styles.subheading}>Sent to {email.trim()}</Text>

              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={6}
                editable={busy === null}
                onSubmitEditing={submitCode}
                returnKeyType="go"
              />

              <TouchableOpacity
                style={[styles.primaryBtn, busy === 'code' && styles.btnDisabled]}
                onPress={submitCode}
                disabled={busy !== null}
                activeOpacity={0.85}
              >
                {busy === 'code'
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.primaryBtnText}>Sign in</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={requestCode} disabled={busy !== null}>
                <Text style={styles.linkBack}>Send a new code</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setMode('email'); setCode(''); }} disabled={busy !== null}>
                <Text style={styles.linkBack}>‹ Use a different email</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={styles.legal}>
          By continuing you agree to the Cloudlynk{' '}
          <Link href="/terms" style={styles.legalLink}>Terms &amp; Conditions</Link>
          {' '}and{' '}
          <Link href="/privacy" style={styles.legalLink}>Privacy Policy</Link>.
        </Text>

        <Text style={styles.version}>v{APP_VERSION}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xxxl },
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logo: { fontSize: 34 },
  logoText: { fontSize: 30, fontWeight: FontWeight.extrabold, color: Colors.text, letterSpacing: -0.5 },
  tagline: { textAlign: 'center', color: Colors.textSecondary, fontSize: FontSize.md, marginTop: 6, marginBottom: Spacing.xxxl },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.xl, borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.xl,
  },
  heading: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.text },
  subheading: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: 4, marginBottom: Spacing.xl },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 15, marginTop: Spacing.sm,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: FontWeight.extrabold },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border,
    paddingVertical: 15, marginTop: Spacing.md,
  },
  secondaryBtnText: { color: Colors.text, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  btnDisabled: { opacity: 0.6 },
  helper: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', marginTop: 8 },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border,
    color: Colors.text, fontSize: FontSize.md, paddingHorizontal: 14, paddingVertical: 13, marginBottom: Spacing.sm,
  },
  codeInput: { textAlign: 'center', letterSpacing: 8, fontSize: 22, fontWeight: FontWeight.extrabold },
  linkBack: { color: Colors.accent, fontSize: FontSize.md, fontWeight: FontWeight.semibold, textAlign: 'center', marginTop: Spacing.md },
  legal: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.xl, lineHeight: 19, paddingHorizontal: 8 },
  legalLink: { color: Colors.accent, fontWeight: FontWeight.semibold },
  version: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.lg },
});
