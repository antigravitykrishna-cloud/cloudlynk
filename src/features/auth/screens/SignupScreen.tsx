import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { showAlert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { AuthCard, AuthLayout } from '@/features/auth/components/AuthLayout';
import { PolicyCheckbox } from '@/features/auth/components/PolicyCheckbox';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  MIN_PASSWORD_LENGTH,
  validateSignup,
  type SignupForm,
} from '@/features/auth/signupValidation';
import { errorMessage } from '@/utils/errors';

// Email + password signup. The sign-in screen's emailed code also creates accounts; this form stays
// for people who want a password.

const EMPTY_FORM: SignupForm = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  birthYear: '',
  agreedToPolicies: false,
};

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const set =
    <K extends keyof SignupForm>(key: K) =>
    (value: SignupForm[K]) =>
      setForm(current => ({ ...current, [key]: value }));

  async function submit() {
    const problem = validateSignup(form);
    if (problem) {
      showAlert(problem.title, problem.message);
      return;
    }

    setSubmitting(true);
    try {
      // signUp() records the policy acceptance (the checkbox is the acceptance).
      await signUp(form.email.trim(), form.password, form.fullName.trim(), Number(form.birthYear));
      showAlert('Account created!', 'Please check your email to verify your account.');
    } catch (err) {
      showAlert('Signup failed', errorMessage(err, 'Something went wrong.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <AuthCard title="Create account" subtitle="Get 15 GB free cloud storage">
        <TextField
          label="Full name"
          value={form.fullName}
          onChangeText={set('fullName')}
          placeholder="John Doe"
          autoCapitalize="words"
        />
        <TextField
          label="Email"
          value={form.email}
          onChangeText={set('email')}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextField
          label="Birth year"
          value={form.birthYear}
          onChangeText={set('birthYear')}
          placeholder="e.g. 1998"
          keyboardType="number-pad"
        />
        <TextField
          label="Password"
          value={form.password}
          onChangeText={set('password')}
          placeholder={`Min ${MIN_PASSWORD_LENGTH} characters`}
          secureTextEntry
        />
        <TextField
          label="Confirm password"
          value={form.confirmPassword}
          onChangeText={set('confirmPassword')}
          placeholder="Repeat password"
          secureTextEntry
          onSubmitEditing={submit}
        />

        <PolicyCheckbox
          checked={form.agreedToPolicies}
          onToggle={() => set('agreedToPolicies')(!form.agreedToPolicies)}
        />

        <Button
          label="Create account"
          size="lg"
          onPress={submit}
          busy={submitting}
          disabled={!form.agreedToPolicies}
        />
      </AuthCard>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/(auth)/login" style={styles.footerLink}>
          Sign in
        </Link>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xxl },
  footerText: { color: Colors.textSecondary, fontSize: FontSize.md },
  footerLink: { color: Colors.brandBlue, fontSize: FontSize.md, fontWeight: FontWeight.bold },
});
