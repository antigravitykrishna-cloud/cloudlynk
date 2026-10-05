import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, FontSize, FontWeight } from '@/constants/theme';
import { GATE_COPY, type PurchaseGate } from '@/lib/payments/checkout';

/** Explains why this account cannot subscribe yet. */
export function GateBanner({ gate }: { gate: Exclude<PurchaseGate, null> }) {
  const copy = GATE_COPY[gate];
  return (
    <View style={[styles.banner, gate === 'rejected' && styles.muted]}>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.text}>{copy.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    backgroundColor: Colors.brandBlueDim,
    borderWidth: 1,
    borderColor: Colors.brandBlueBorder,
    borderRadius: Radius.lg,
  },
  muted: {
    backgroundColor: 'rgba(159,176,201,0.10)',
    borderColor: Colors.border,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: 6,
  },
  text: { color: Colors.textSecondary, fontSize: FontSize.base, lineHeight: 19 },
});
