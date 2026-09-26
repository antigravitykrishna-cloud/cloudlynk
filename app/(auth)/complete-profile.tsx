// Shown after sign-in for an account that has not yet accepted the current
// POLICY_VERSIONS (or has no 18+ confirmation on file). RootLayout
// (app/_layout.tsx) routes here via ComplianceService.hasAcceptedCurrentPolicies().
//
// v88: no birth year. Every visitor already answered "I am 18 or older" on
// the age gate (components/AgeGate.tsx), whose text also accepts the Terms,
// Community Guidelines and Privacy Policy. So a brand-new account on a
// device that passed the gate is completed automatically and this screen is
// only a spinner. The card appears only when that is not enough:
//   * the device has no gate answer on file (e.g. storage was cleared), or
//   * the account accepted an OLDER policy version -- a policy change has to
//     be shown to the person, not accepted for them.
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { logRegistration } from '../../lib/metaAds';
import { useAuth } from '../../hooks/useAuth';
import { hasConfirmedAgeOnDevice } from '../../components/AgeGate';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

export default function CompleteProfileScreen() {
  const { user, profile, completeProfile, signOut } = useAuth();
  // Never accepted any version: a new account. Accepted an older one: a
  // returning member who must see the updated policies.
  const isNewAccount = !profile?.terms_accepted_at;
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(isNewAccount);
  const tried = useRef(false);

  async function finish() {
    await completeProfile();
    if (isNewAccount) {
      logRegistration(user?.app_metadata?.provider === 'google' ? 'google' : 'email');
    }
    // No navigation: RootLayout's redirect re-runs once `profile` updates.
  }

  useEffect(() => {
    if (!isNewAccount || tried.current) return;
    tried.current = true;
    (async () => {
      if (!(await hasConfirmedAgeOnDevice())) { setAuto(false); return; }
      try {
        await finish();
      } catch {
        // Fall back to the manual card rather than a dead end.
        setAuto(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewAccount]);

  async function handleContinue() {
    if (!agreed) return;
    setLoading(true);
    try {
      await finish();
    } catch (err: any) {
      showAlert('Could not continue', err?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (auto) {
    return (
      <View style={[styles.container, { flex: 1, backgroundColor: Colors.bg, alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
        <Text style={[styles.subheading, { marginTop: Spacing.lg, textAlign: 'center' }]}>
          Setting up your account...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={styles.container}
    >
      <View style={styles.logoRow}>
        <Text style={styles.logo}>☁</Text>
        <Text style={styles.logoText}>
          Cloud<Text style={{ color: Colors.accent }}>lynk</Text>
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>{isNewAccount ? 'One more step' : 'Our policies changed'}</Text>
        <Text style={styles.subheading}>
          {isNewAccount
            ? `${user?.email ? `Welcome, ${user.email}. ` : ''}Please confirm to start using Cloudlynk.`
            : 'Please review and accept the updated policies to continue.'}
        </Text>

        <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(!agreed)} activeOpacity={0.7}>
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>{'✓'}</Text>}
          </View>
          <Text style={styles.terms}>
            I am 18 or older and agree to the{' '}
            <Link href="/terms" style={{ color: Colors.accent }}>Terms of Service</Link>,{' '}
            <Link href="/community-guidelines" style={{ color: Colors.accent }}>Community Guidelines</Link>, and{' '}
            <Link href="/privacy" style={{ color: Colors.accent }}>Privacy Policy</Link>.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, (loading || !agreed) && { opacity: 0.6 }]}
          onPress={handleContinue}
          disabled={loading || !agreed}
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
