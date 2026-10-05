import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CloudlynkLogo } from '@/components/ui/CloudlynkLogo';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';

/** The centred, keyboard-aware page every sign-in screen sits on. */
export function AuthLayout({
  children,
  showBrand = true,
  tagline,
}: {
  children: ReactNode;
  showBrand?: boolean;
  tagline?: string;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {showBrand ? (
          <View style={styles.brand}>
            <View style={styles.wordmark}>
              <CloudlynkLogo size={36} />
              <Text style={styles.wordmarkText}>
                Cloud<Text style={styles.wordmarkAccent}>lynk</Text>
              </Text>
            </View>
            {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The card a sign-in step sits in: optional icon, a title, a line of explanation, then the form. */
export function AuthCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon?: IconName;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      {icon ? (
        <View style={styles.cardIcon}>
          <Icon name={icon} size={40} color={Colors.success} />
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl,
  },
  brand: { alignItems: 'center', marginBottom: Spacing.xxl },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  wordmarkText: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  wordmarkAccent: { color: Colors.brandBlue },
  tagline: { color: Colors.textSecondary, fontSize: FontSize.md, marginTop: 6 },
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Spacing.xl,
  },
  cardIcon: { alignItems: 'center', marginBottom: Spacing.md },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.text },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
});
