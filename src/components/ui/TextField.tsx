import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';

type Props = TextInputProps & {
  label?: string;
  /** Small print under the field. Replaced by `error` while there is one. */
  hint?: string;
  error?: string | null;
  /** Something before the input in the same row, e.g. an "@" before a username. */
  leading?: ReactNode;
  /** Something after the input in the same row, e.g. a show-password toggle. */
  trailing?: ReactNode;
};

/** A labelled text input: the one form field used across the app. */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, hint, error, leading, trailing, style, multiline, ...inputProps },
  ref,
) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {leading}
        <TextInput
          ref={ref}
          placeholderTextColor={Colors.textMuted}
          multiline={multiline}
          style={[
            styles.input,
            multiline && styles.multiline,
            error ? styles.inputError : null,
            style,
          ]}
          {...inputProps}
        />
        {trailing}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { marginBottom: Spacing.lg },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: FontSize.base,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  inputError: { borderColor: Colors.danger },
  hint: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: Spacing.xs, lineHeight: 17 },
  error: { color: Colors.danger, fontSize: FontSize.sm, marginTop: Spacing.xs, lineHeight: 17 },
});
