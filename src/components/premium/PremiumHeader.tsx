import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/theme';

/** "< Back   Premium" bar at the top of the Premium screen. */
export function PremiumHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.side}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={styles.backTxt}>{'< Back'}</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Premium</Text>
      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  side: { width: 80 },
  backTxt: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  title: { color: '#ffffff', fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
});
