import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';

// Premium unlocks titles marked Premium (enforced server-side); it does not add storage. Keep this
// list to things the app really does -- Play reviewers compare it with the app.
const BENEFITS = [
  'Unlock Premium Movies & Web Series',
  'Support the channels and creators you follow',
];

/** What Premium includes, above every plan list. */
export function BenefitsCard() {
  return (
    <Animated.View entering={FadeInDown.duration(280)} style={styles.card}>
      <View style={styles.pill}>
        <Text style={styles.pillText}>Premium</Text>
      </View>
      {BENEFITS.map(benefit => (
        <View key={benefit} style={styles.row}>
          <Icon name="check-circle" size={18} color={Colors.brandBlue} />
          <Text style={styles.benefit}>{benefit}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.brandBlueDim,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.brandBlue,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: Spacing.xs,
  },
  pillText: { color: Colors.text, fontSize: FontSize.md, fontWeight: FontWeight.extrabold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefit: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.subhead,
    fontWeight: FontWeight.semibold,
  },
});
