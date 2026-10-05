import { StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { PURCHASE_GATE_COPY, type PurchaseGate } from '@/features/premium/purchaseGate';

/** Why this account cannot buy yet, above the plans. A refusal is shown muted, not as an alert. */
export function PurchaseGateBanner({ gate }: { gate: PurchaseGate }) {
  const { title, message } = PURCHASE_GATE_COPY[gate];
  return (
    <View style={[styles.banner, gate === 'rejected' && styles.muted]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.brandBlueDim,
    borderWidth: 1,
    borderColor: Colors.brandBlueBorder,
    borderRadius: Radius.lg,
  },
  muted: { backgroundColor: Colors.neutralDim, borderColor: Colors.border },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: 6,
  },
  message: { color: Colors.textSecondary, fontSize: FontSize.base, lineHeight: 19 },
});
