import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CloudlynkLogo } from '@/components/ui/CloudlynkLogo';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';

type Props = {
  title: string;
  /** Extra rows that share the header's background, e.g. a search bar. */
  children?: ReactNode;
};

/** The large title and logo at the top of each bottom tab. */
export function TabHeader({ title, children }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        <CloudlynkLogo size={28} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.surface },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.extrabold,
    letterSpacing: -0.5,
  },
});
