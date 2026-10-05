import { StyleSheet } from 'react-native';
import { Button, TextButton } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { FontSize, FontWeight } from '@/theme';

// The two halves of every "email me a code" flow: signing in, and saving a guest account.

/** Step 1: the email address. */
export function EmailStep({
  email,
  onChangeEmail,
  onSubmit,
  onBack,
  sending,
  disabled,
}: {
  email: string;
  onChangeEmail: (email: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  /** The code is being sent: spinner on the button. */
  sending: boolean;
  /** Something else on the screen is busy: block input. */
  disabled: boolean;
}) {
  return (
    <>
      <TextField
        value={email}
        onChangeText={onChangeEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        // Each step mounts its own input, so focus follows the step without a ref.
        autoFocus
        editable={!disabled}
        onSubmitEditing={onSubmit}
        returnKeyType="send"
      />
      <Button label="Send code" onPress={onSubmit} busy={sending} disabled={disabled} size="lg" />
      <TextButton label="‹ Back" onPress={onBack} disabled={disabled} />
    </>
  );
}

/** Step 2: the 6-digit code from the email. */
export function CodeStep({
  code,
  onChangeCode,
  onSubmit,
  submitLabel,
  submitting,
  disabled,
  onResend,
  onUseDifferentEmail,
}: {
  code: string;
  onChangeCode: (code: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  submitting: boolean;
  disabled: boolean;
  onResend?: () => void;
  onUseDifferentEmail: () => void;
}) {
  return (
    <>
      <TextField
        style={styles.codeInput}
        value={code}
        onChangeText={text => onChangeCode(text.replace(/\D/g, '').slice(0, 6))}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        // Focused so the platform offers the code from the email/SMS as an autofill suggestion.
        autoFocus
        maxLength={6}
        editable={!disabled}
        onSubmitEditing={onSubmit}
        returnKeyType="go"
      />
      <Button
        label={submitLabel}
        onPress={onSubmit}
        busy={submitting}
        disabled={disabled}
        size="lg"
      />
      {onResend ? (
        <TextButton label="Send a new code" onPress={onResend} disabled={disabled} />
      ) : null}
      <TextButton
        label="‹ Use a different email"
        onPress={onUseDifferentEmail}
        disabled={disabled}
      />
    </>
  );
}

/** Whether `email` looks like an address worth sending a code to. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const styles = StyleSheet.create({
  codeInput: {
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extrabold,
  },
});
