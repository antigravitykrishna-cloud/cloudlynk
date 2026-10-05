import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { PressScale } from './Press';
import { Icon } from './Icon';
import type { GatewayMethod } from '../lib/payments';

// "Choose payment method" -- the client's reference sheet.
//
// Which rows appear is decided by the caller:
//   * Google Play is a row only in 'test' builds. On Play, user choice
//     billing requires Google's own choice screen to come first, so by the
//     time this sheet opens the person has already chosen not to use Play.
//   * A gateway row appears only if the server has that gateway's keys
//     (lib/payments.ts getGatewayMethods) -- never a button that cannot work.

export type PaymentChoice = GatewayMethod | 'play';

const META: Record<PaymentChoice, { title: string; subtitle: string; badge: string; tint: string }> = {
  upi:      { title: 'UPI',         subtitle: 'GPay, PhonePe, Paytm and any UPI app', badge: 'UPI', tint: '#FF7A00' },
  play:     { title: 'Google Play', subtitle: 'Pay with your Google account',        badge: '▶',   tint: '#34A853' },
  razorpay: { title: 'Razorpay',    subtitle: 'Cards, net banking, wallets, UPI',    badge: 'R',   tint: '#3395FF' },
  sabpaisa: { title: 'Sabpaisa',    subtitle: 'Cards, net banking, UPI',             badge: 'S',   tint: '#1E63D6' },
};

export function PaymentSheet({
  visible,
  choices,
  priceInr,
  planName,
  busy,
  onSelect,
  onClose,
}: {
  visible: boolean;
  choices: PaymentChoice[];
  priceInr: number;
  planName: string;
  busy?: boolean;
  onSelect: (choice: PaymentChoice) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} accessibilityLabel="Close" />
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(220)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.sm }]}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>Choose payment method</Text>
          <Text style={styles.subtitle}>{planName} plan · ₹{priceInr}</Text>

          {choices.map(choice => {
            const m = META[choice];
            return (
              <PressScale
                key={choice}
                style={[styles.row, busy && { opacity: 0.5 }]}
                onPress={() => onSelect(choice)}
                disabled={busy}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`Pay ${priceInr} rupees with ${m.title}`}
              >
                <View style={[styles.badge, { backgroundColor: m.tint }]}>
                  <Text style={styles.badgeText} numberOfLines={1}>{m.badge}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{m.title}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{m.subtitle}</Text>
                </View>
                <Text style={styles.price}>₹{priceInr}</Text>
                <Icon name="chevron-right" size={16} color={Colors.textMuted} />
              </PressScale>
            );
          })}

          <TouchableOpacity onPress={onClose} disabled={busy} activeOpacity={0.7} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm,
  },
  grabber: {
    alignSelf: 'center', width: 36, height: 5, borderRadius: 3,
    backgroundColor: Colors.borderStrong, marginBottom: Spacing.lg,
  },
  title: { color: Colors.text, fontSize: FontSize.xxl, fontWeight: FontWeight.bold, letterSpacing: -0.3, marginLeft: Spacing.xs },
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.subhead, marginTop: 4, marginBottom: Spacing.lg, marginLeft: Spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 14, paddingHorizontal: Spacing.lg, marginBottom: 10,
  },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: FontWeight.extrabold },
  rowTitle: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  rowSub: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  price: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  cancel: { alignSelf: 'center', paddingVertical: Spacing.md, marginTop: Spacing.xs },
  cancelText: { color: Colors.textSecondary, fontSize: FontSize.subhead, fontWeight: FontWeight.semibold },
});
