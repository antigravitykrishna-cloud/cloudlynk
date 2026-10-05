import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';

type Props = {
  title: string;
  /** Optional action on the right, e.g. "Mark all read". */
  right?: ReactNode;
  /** Overrides the back button. By default it goes back, or to `fallbackHref` with no history. */
  onBack?: () => void;
  /** Where back goes when the screen was opened directly (a deep link or a cold start). */
  fallbackHref?: Href;
};

/** The header of every pushed screen: back button, centred title, optional right action. */
export function ScreenHeader({ title, right, onBack, fallbackHref = '/(tabs)/explore' }: Props) {
  const router = useRouter();

  const goBack = () => {
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  };

  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.side}
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={styles.chevron}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  // Both sides share a width so the title stays centred whatever the right slot holds.
  side: { minWidth: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  right: { alignItems: 'flex-end', paddingRight: Spacing.sm },
  chevron: {
    fontSize: 30,
    color: Colors.brandBlue,
    fontWeight: FontWeight.regular,
    lineHeight: 32,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
});
