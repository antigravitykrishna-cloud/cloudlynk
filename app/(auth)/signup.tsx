import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    const showAlert = (title: string, msg: string) => {
      if (Platform.OS === 'web') window.alert(`${title}: ${msg}`);
      else showAlert(title, msg);
    };

    if (!fullName.trim() || !email.trim() || !password || !birthYear.trim()) {
      showAlert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      showAlert('Password mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      showAlert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    const currentYear = new Date().getFullYear();
    const parsedBirthYear = parseInt(birthYear.trim(), 10);
    if (!Number.isInteger(parsedBirthYear) || parsedBirthYear < currentYear - 120 || parsedBirthYear > currentYear) {
      showAlert('Invalid birth year', 'Please enter a valid 4-digit birth year (e.g. 1998).');
      return;
    }
    if (currentYear - parsedBirthYear < 18) {
      showAlert('Age restriction', 'You must be at least 18 years old to create a Cloudlynk account.');
      return;
    }
    if (!agreedToTerms) {
      showAlert('Agreement required', 'Please agree to the Terms of Service, Community Guidelines, and Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    try {
      // signUp() persists the policy acceptance itself (the checkbox above
      // IS the acceptance) and does it before caching the profile, so the
      // session doesn't get bounced to complete-profile on a stale read.
      // See hooks/useAuth.ts.
      await signUp(email.trim(), password, fullName.trim(), parsedBirthYear);
      showAlert('Account created!', 'Please check your email to verify your account.');
    } catch (err: any) {
      showAlert('Signup failed', err.message ?? 'Something went wrong.');
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
          <Text style={styles.heading}>Create account</Text>
          <Text style={styles.subheading}>Get 15 GB free cloud storage</Text>

          {[
            { label: 'Full Name', value: fullName, setter: setFullName, placeholder: 'John Doe', type: 'default' },
            { label: 'Email', value: email, setter: setEmail, placeholder: 'you@example.com', type: 'email-address' },
            { label: 'Birth Year', value: birthYear, setter: setBirthYear, placeholder: 'e.g. 1998', type: 'number-pad' },
          ].map(({ label, value, setter, placeholder, type }) => (
            <View style={styles.field} key={label}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={setter}
                placeholder={placeholder}
                placeholderTextColor={Colors.textMuted}
                autoCapitalize={type === 'default' ? 'words' : 'none'}
                keyboardType={type as any}
              />
            </View>
          ))}

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Min 8 characters"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              onSubmitEditing={handleSignUp}
            />
          </View>

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
            onPress={handleSignUp}
            disabled={loading || !agreedToTerms}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.btnText}>Create Account</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" style={styles.footerLink}>Sign in</Link>
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
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xxl },
  footerText: { color: Colors.textSecondary, fontSize: FontSize.md },
  footerLink: { color: Colors.accent, fontSize: FontSize.md, fontWeight: FontWeight.bold },
});
