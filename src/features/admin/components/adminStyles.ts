import { StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';

/** Text and layout styles the admin screens share, so they read as one panel. */
export const adminStyles = StyleSheet.create({
  list: { padding: Spacing.lg, paddingBottom: 40 },
  muted: { color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  label: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    marginBottom: 6,
  },
  value: { color: Colors.text, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  name: { color: Colors.text, fontSize: FontSize.subhead, fontWeight: FontWeight.bold },
  section: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.6,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
});
