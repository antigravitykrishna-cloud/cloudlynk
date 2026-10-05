import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing, withAlpha } from '@/theme';

/** Nudges a guest ID to save the account: it is lost on uninstall or a new phone. */
export function SaveAccountBanner({ hasPlan }: { hasPlan: boolean }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={() => router.push('/save-account')}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Icon name="lock" size={20} color={Colors.text} />
      <View style={styles.text}>
        <Text style={styles.title}>Save your account</Text>
        <Text style={styles.message}>
          {hasPlan
            ? 'Your plan is on a guest account. Save it so you never lose it.'
            : 'Guest accounts are lost if you uninstall or change phones.'}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={Colors.text} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.brandBlue,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  text: { flex: 1 },
  title: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.extrabold },
  message: {
    color: withAlpha(Colors.white, 0.9),
    fontSize: FontSize.md,
    marginTop: 2,
    lineHeight: 18,
  },
});
