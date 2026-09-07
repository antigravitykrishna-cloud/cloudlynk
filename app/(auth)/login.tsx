import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import Constants from 'expo-constants';
import { Icon } from '../../components/Icon';

// Read the real version rather than a literal: this said "v1.0" while the
// app shipped 0.7.1, and a hardcoded string drifts again at the next bump.
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') window.alert(`${title}: ${msg}`);
    else showAlert(title, msg);
  };

  async function handleLogin() {
    if (!email.trim() || !password) {
      showAlert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      showAlert('Login failed', err.message ?? 'Invalid credentials.');
    } finally {
      setLoading(false);
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
          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.subheading}>Sign in to your account</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={19} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Recovery. Before this the app had none at all — no link, no
              resetPasswordForEmail call — so a forgotten password meant being
              locked out permanently and fixed by hand in the dashboard. */}
          <TouchableOpacity
            onPress={() => router.push('/(auth)/forgot-password')}
            activeOpacity={0.7}
            style={styles.forgotWrap}
          >
            <Text style={styles.forgotTxt}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, loading && { opacity: 0.6 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.btnText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/signup" style={styles.footerLink}>Sign up free</Link>
        </View>

        {/* v61: browsing does not require an account. The app already opens on
            Explore for a signed-out visitor; this is the way back out for
            anyone who reached the login screen and would rather look around
            first. Watching still asks for a sign-in. */}
        <View style={styles.guestWrap}>
          <View style={styles.guestRule} />
          <Text style={styles.guestOr}>or</Text>
          <View style={styles.guestRule} />
        </View>

        <TouchableOpacity
          style={styles.guestBtn}
          onPress={() => router.replace('/(tabs)/explore')}
          activeOpacity={0.8}
        >
          <Text style={styles.guestBtnTxt}>Continue as guest</Text>
        </TouchableOpacity>
        <Text style={styles.guestHint}>
          Browse everything. Free titles play without an account.
        </Text>

        <Text style={styles.version}>Cloudlynk v{APP_VERSION}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  logo: { fontSize: 36 },
  logoText: {
    fontSize: 32,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    letterSpacing: -1,
  },
  tagline: {
    textAlign: 'center',
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.xxl,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  heading: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subheading: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.xl,
  },
  field: { marginBottom: Spacing.lg },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: FontSize.base,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  eyeBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  btn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  btnText: {
    color: '#000',
    fontSize: FontSize.base,
    fontWeight: FontWeight.extrabold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.xxl,
  },
  footerText: { color: Colors.textSecondary, fontSize: FontSize.md },
  footerLink: { color: Colors.accent, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  forgotWrap: { alignSelf: 'flex-end', marginBottom: Spacing.md },
  forgotTxt: { color: Colors.accent, fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  guestWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: Spacing.xl, marginBottom: Spacing.lg, paddingHorizontal: Spacing.xl,
  },
  guestRule: { flex: 1, height: 1, backgroundColor: Colors.border },
  guestOr: {
    color: Colors.textMuted, fontSize: FontSize.sm,
    marginHorizontal: Spacing.md, textTransform: 'uppercase', letterSpacing: 1,
  },
  guestBtn: {
    alignSelf: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.borderStrong,
    backgroundColor: 'transparent',
  },
  guestBtnTxt: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  guestHint: {
    color: Colors.textMuted, fontSize: FontSize.sm,
    textAlign: 'center', marginTop: Spacing.sm,
  },
  version: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: Spacing.xl,
  },
});
