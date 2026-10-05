import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { Icon, type IconName } from './Icon';

// What a signed-out visitor sees on a tab that needs an account.
//
// v61 opened every tab to guests, but only Explore has anything to show them.
// Cloud, Channels and Profile all early-return on `!user?.id`, so without this
// a guest tapping them got a blank screen and no idea why — which reads as a
// broken app, not a locked feature.
//
// Each tab passes its own line about what the account unlocks, because "sign in
// to continue" three times says nothing, and the reason someone would want an
// account differs per tab.

export function GuestPrompt({
  icon,
  title,
  message,
  /**
   * Optional third action. Profile uses it to link to the Premium plans:
   * a signed-out visitor could not see what a subscription costs from
   * anywhere in the app, which hides the pitch from the people most likely
   * to be deciding whether to make an account at all.
   */
  linkLabel,
  linkHref,
}: {
  icon: IconName;
  title: string;
  message: string;
  linkLabel?: string;
  linkHref?: string;
}) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.icon}><Icon name={icon} size={46} color={Colors.brandBlue} /></View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      {/* Both routes go to /(auth)/login, and there is only one button.
          This used to send "Create free account" to /(auth)/signup -- the old
          email + password + full name form -- so the primary call to action of
          a passwordless app dropped a new user onto the exact form the
          passwordless rebuild existed to remove, while the secondary link
          quietly went to the good screen. Backwards, on the busiest signup
          path in the app.
          /(auth)/login is now a chooser (guest / Google / emailed code) that
          signs in and creates the account in the same step, so "sign in" and
          "sign up" are not different destinations any more and offering them
          as two choices only invites the wrong one. */}
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => router.push('/(auth)/login')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Continue — sign in or create an account"
      >
        <Text style={styles.primaryTxt}>Continue</Text>
      </TouchableOpacity>

      {linkLabel && linkHref ? (
        <TouchableOpacity onPress={() => router.push(linkHref as never)} activeOpacity={0.7}>
          <Text style={styles.link}>{linkLabel}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.footnote}>
        Free forever. 15 GB of storage included.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    color: Colors.brandCyan, fontSize: FontSize.base,
    fontWeight: FontWeight.semibold, marginTop: Spacing.lg,
  },
  wrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xxl, paddingBottom: Spacing.xxxl,
  },
  icon: { marginBottom: Spacing.lg },
  title: {
    color: Colors.text, fontSize: FontSize.xxl, fontWeight: FontWeight.bold,
    textAlign: 'center', marginBottom: Spacing.sm,
  },
  message: {
    color: Colors.textSecondary, fontSize: FontSize.lg, lineHeight: 22,
    textAlign: 'center', marginBottom: Spacing.xxl, maxWidth: 320,
  },
  primaryBtn: {
    backgroundColor: Colors.brandBlue, borderRadius: Radius.full,
    paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xxxl,
    alignItems: 'center', minWidth: 240,
  },
  primaryTxt: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  ghostBtn: { paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xl, marginTop: Spacing.xs },
  ghostTxt: { color: Colors.accent, fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  footnote: { color: Colors.textMuted, fontSize: FontSize.md, marginTop: Spacing.md },
});
