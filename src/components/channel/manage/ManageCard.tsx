import type { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

/** The card every section of the manage screen sits in. */
export function ManageCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function ManageCardTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: { color: Colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 },
});
