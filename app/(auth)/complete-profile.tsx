// Shown after sign-in for any account whose profile is missing the birth
// year / policy-acceptance that email+password signup collects up front
// (app/(auth)/signup.tsx) — in practice today that's an existing account
// that hasn't accepted the current POLICY_VERSIONS yet.
//
// It asks for ONLY what is actually missing. An account that already has a
// birth year on file (every email/password signup does) gets just the
// acceptance checkbox: `set_birth_year` is one-shot by design and raises if
// called twice, so re-asking would be both pointless and, previously, a
// dead end that no user could get past.
// RootLayout (app/_layout.tsx) routes here automatically via
// ComplianceService.hasAcceptedCurrentPolicies(); there is no way to
// navigate to this screen except by having an incomplete profile.
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

export default function CompleteProfileScreen() {
  const { user, profile, completeProfile, deleteAccount, signOut } = useAuth();
  const needsBirthYear = !profile?.birth_year;
  const [birthYear, setBirthYear] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') window.alert(`${title}: ${msg}`);
    else showAlert(title, msg);
  };

  async function handleContinue() {
    const currentYear = new Date().getFullYear();
    let parsedBirthYear: number | undefined;
    if (needsBirthYear) {
      parsedBirthYear = parseInt(birthYear.trim(), 10);
      if (!Number.isInteger(parsedBirthYear) || parsedBirthYear < currentYear - 120 || parsedBirthYear > currentYear) {
        showAlert('Invalid birth year', 'Please enter a valid 4-digit birth year (e.g. 1998).');
        return;
      }
    }
    if (!agreedToTerms) {
      showAlert('Agreement required', 'Please agree to the Terms of Service, Community Guidelines, and Privacy Policy to continue.');
      return;
    }

    setLoading(true);
    try {
      await completeProfile(parsedBirthYear);
      // No further navigation needed — RootLayout's redirect effect re-runs
      // once `profile` updates and sends this session on to /(tabs).
    } catch (err: any) {
      const underage = /18 years old/i.test(err.message ?? '');
      if (underage) {
        // The account already exists but has no birth year on file, so
        // nothing asked the 18+ question until now. Cloudlynk requires 18+,
        // so it can't be left around half-created — delete it outright
        // rather than leaving an orphaned, permanently-incomplete account.
        try {
          await deleteAccount();
        } catch {
          await signOut().catch(() => {});
        }
        showAlert('Age restriction', 'You must be at least 18 years old to use Cloudlynk. This sign-in has been cancelled.');
      } else {
        showAlert('Could not continue', err.message ?? 'Something went wrong.');
      }
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

        <View style={styles.card}>
          <Text style={styles.heading}>One more step</Text>
          <Text style={styles.subheading}>
            {user?.email ? `Welcome, ${user.email}. ` : ''}
            {needsBirthYear
              ? 'We just need a couple things before you can start using Cloudlynk.'
              : 'Please review and accept our policies to continue.'}
          </Text>

          {needsBirthYear && (
            <View style={styles.field}>
              <Text style={styles.label}>Birth Year</Text>
              <TextInput
                style={styles.input}
                value={birthYear}
                onChangeText={setBirthYear}
                placeholder="e.g. 1998"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.agreeRow}
            onPress={() => setAgreedToTerms(!agreedToTerms)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
              {agreedToTerms && <Text style={styles.checkmark}>{'✓'}</Text>}
            </View>
            <Text style={styles.terms}>
              I agree to the{' '}
              <Link href="/terms" style={{ color: Colors.accent }}>Terms of Service</Link>,{' '}
              <Link href="/community-guidelines" style={{ color: Colors.accent }}>Community Guidelines</Link>, and{' '}
              <Link href="/privacy" style={{ color: Colors.accent }}>Privacy Policy</Link>.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, (loading || !agreedToTerms) && { opacity: 0.6 }]}
            onPress={handleContinue}
            disabled={loading || !agreedToTerms}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.btnText}>Continue</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => signOut()} disabled={loading}>
            <Text style={styles.cancelText}>Cancel and sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  logoRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.xl,
  },
  logo: { fontSize: 32 },
  logoText: { fontSize: 28, fontWeight: FontWeight.extrabold, color: Colors.text, letterSpacing: -1 },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.xl,
    padding: Spacing.xl, borderWidth: 0.5, borderColor: Colors.border,
  },
  heading: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.text, marginBottom: Spacing.xs },
  subheading: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.semibold, marginBottom: Spacing.xl },
  field: { marginBottom: Spacing.md },
  label: {
    fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary,
    marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 0.5,
    borderColor: Colors.border, color: Colors.text, fontSize: FontSize.base,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: Spacing.lg },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  checkmark: { color: '#000', fontSize: 13, fontWeight: '900' },
  terms: { flex: 1, fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 18 },
  btn: {
    backgroundColor: Colors.accent, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  btnText: { color: '#000', fontSize: FontSize.base, fontWeight: FontWeight.extrabold },
  cancelBtn: { alignItems: 'center', marginTop: Spacing.lg },
  cancelText: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});
