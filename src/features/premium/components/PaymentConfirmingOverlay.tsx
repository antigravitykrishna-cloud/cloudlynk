import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, FontWeight, Spacing, withAlpha } from '@/theme';

/** Covers the screen while the server confirms a gateway payment, so nothing is tapped twice. */
export function PaymentConfirmingOverlay() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      <ActivityIndicator color={Colors.text} size="large" />
      <Text style={styles.text}>Confirming your payment…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: withAlpha(Colors.bg, 0.88),
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  text: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
});
