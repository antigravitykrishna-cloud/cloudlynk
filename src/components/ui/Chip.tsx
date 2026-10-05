import { StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, FontWeight, Radius } from '@/theme';

/** good = done / active, warn = waiting / expiring, bad = rejected / failed, brand = neutral info. */
export type ChipTone = 'neutral' | 'good' | 'warn' | 'bad' | 'brand';

const TONES: Record<ChipTone, { background: string; foreground: string }> = {
  neutral: { background: Colors.neutralDim, foreground: Colors.textSecondary },
  good: { background: Colors.successDim, foreground: Colors.success },
  warn: { background: Colors.warningDim, foreground: Colors.warning },
  bad: { background: Colors.dangerDim, foreground: Colors.danger },
  brand: { background: Colors.brandBlueDim, foreground: Colors.brandBlue },
};

/** A small status label, e.g. PENDING or PREMIUM. */
export function Chip({ label, tone = 'neutral' }: { label: string; tone?: ChipTone }) {
  const { background, foreground } = TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: background }]}>
      <Text style={[styles.label, { color: foreground }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: Radius.xs,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  label: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
});
