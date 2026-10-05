import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/Press';
import { Colors, FontSize, FontWeight, PartnerColors, Radius, Spacing, withAlpha } from '@/theme';
import type { PaymentChoice } from '@/features/premium/paymentChoices';

// The "Choose payment method" sheet. The caller decides the rows (see paymentChoices.ts).

const CHOICES: Record<
  PaymentChoice,
  { title: string; subtitle: string; badge: string; tint: string }
> = {
  upi: {
    title: 'UPI',
    subtitle: 'GPay, PhonePe, Paytm and any UPI app',
    badge: 'UPI',
    tint: PartnerColors.upi,
  },
  play: {
    title: 'Google Play',
    subtitle: 'Pay with your Google account',
    badge: '▶',
    tint: PartnerColors.googlePlay,
  },
  razorpay: {
    title: 'Razorpay',
    subtitle: 'Cards, net banking, wallets, UPI',
    badge: 'R',
    tint: PartnerColors.razorpay,
  },
  sabpaisa: {
    title: 'Sabpaisa',
    subtitle: 'Cards, net banking, UPI',
    badge: 'S',
    tint: PartnerColors.sabpaisa,
  },
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
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={busy ? undefined : onClose}
          accessibilityLabel="Close"
        />
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(220)}
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.sm },
          ]}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>Choose payment method</Text>
          <Text style={styles.subtitle}>
            {planName} plan · ₹{priceInr}
          </Text>

          {choices.map(choice => {
            const { title, subtitle, badge, tint } = CHOICES[choice];
            return (
              <PressScale
                key={choice}
                style={[styles.row, busy && styles.inactive]}
                onPress={() => onSelect(choice)}
                disabled={busy}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`Pay ${priceInr} rupees with ${title}`}
              >
                <View style={[styles.badge, { backgroundColor: tint }]}>
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {badge}
                  </Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{title}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {subtitle}
                  </Text>
                </View>
                <Text style={styles.price}>₹{priceInr}</Text>
                <Icon name="chevron-right" size={16} color={Colors.textMuted} />
              </PressScale>
            );
          })}

          <TextButton label="Cancel" tone="muted" onPress={onClose} disabled={busy} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: withAlpha(Colors.black, 0.55), justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.borderStrong,
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.3,
    marginLeft: Spacing.xs,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.subhead,
    marginTop: 4,
    marginBottom: Spacing.lg,
    marginLeft: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    marginBottom: 10,
  },
  inactive: { opacity: 0.5 },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Colors.text, fontSize: FontSize.md, fontWeight: FontWeight.extrabold },
  rowText: { flex: 1 },
  rowTitle: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  rowSub: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  price: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
});
