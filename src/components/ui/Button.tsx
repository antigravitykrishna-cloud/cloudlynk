import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { PressScale, type HapticStyle } from '@/components/ui/Press';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing, withAlpha } from '@/theme';

/**
 * The app's button. `primary` is the one main action on a screen; `secondary` sits beside it;
 * `danger`, `warning` and `success` are tinted for destructive, cautionary and approving actions;
 * `outline` is a quiet alternative to primary. `inverse` and `overlay` sit on top of artwork.
 */
export type ButtonVariant =
  'primary' | 'secondary' | 'danger' | 'warning' | 'success' | 'outline' | 'inverse' | 'overlay';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Shows a spinner in place of the label and blocks presses. */
  busy?: boolean;
  disabled?: boolean;
  /** Fully rounded ends, for standalone calls to action. */
  pill?: boolean;
  /** Set for actions with a consequence (subscribe, approve, delete). */
  haptic?: HapticStyle;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const VARIANTS: Record<ButtonVariant, { background: string; foreground: string; border?: string }> =
  {
    primary: { background: Colors.brandBlue, foreground: Colors.white },
    secondary: {
      background: Colors.surfaceElevated,
      foreground: Colors.text,
      border: Colors.border,
    },
    danger: { background: Colors.dangerDim, foreground: Colors.danger },
    warning: { background: Colors.warningDim, foreground: Colors.warning },
    success: { background: Colors.successDim, foreground: Colors.success },
    outline: { background: 'transparent', foreground: Colors.brandBlue, border: Colors.brandBlue },
    inverse: { background: Colors.white, foreground: Colors.textInverse },
    overlay: { background: withAlpha(Colors.white, 0.2), foreground: Colors.text },
  };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  busy = false,
  disabled = false,
  pill = false,
  haptic,
  style,
  accessibilityLabel,
}: Props) {
  const { background, foreground, border } = VARIANTS[variant];
  const inactive = disabled || busy;

  return (
    <PressScale
      onPress={onPress}
      disabled={inactive}
      haptic={haptic}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      style={[
        styles.base,
        sizeStyles[size],
        { backgroundColor: background },
        border ? { borderWidth: 1, borderColor: border } : null,
        pill && styles.pill,
        inactive && styles.inactive,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={labelSizes[size] + 2} color={foreground} /> : null}
          <Text style={[styles.label, { color: foreground, fontSize: labelSizes[size] }]}>
            {label}
          </Text>
        </View>
      )}
    </PressScale>
  );
}

const labelSizes: Record<ButtonSize, number> = {
  sm: FontSize.md,
  md: FontSize.base,
  lg: FontSize.lg,
};

const sizeStyles = StyleSheet.create({
  sm: { paddingVertical: Spacing.sm, paddingHorizontal: 14, borderRadius: Radius.sm },
  md: { paddingVertical: 11, paddingHorizontal: Spacing.lg, borderRadius: Radius.md },
  lg: { paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xxl, borderRadius: Radius.md },
});

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { fontWeight: FontWeight.bold },
  pill: { borderRadius: Radius.full },
  inactive: { opacity: 0.5 },
});

/** A plain text action, for secondary choices like "Back" or "Send a new code". */
export function TextButton({
  label,
  onPress,
  disabled = false,
  tone = 'brand',
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** `muted` for the least important choice on the screen, e.g. "Not now". */
  tone?: 'brand' | 'muted';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[textButtonStyles.base, disabled && styles.inactive, style]}
    >
      <Text
        style={[
          textButtonStyles.label,
          { color: tone === 'brand' ? Colors.brandBlue : Colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </PressScale>
  );
}

const textButtonStyles = StyleSheet.create({
  base: { alignItems: 'center', paddingVertical: Spacing.md },
  label: { fontSize: FontSize.md, fontWeight: FontWeight.semibold },
});
