import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { setPostLoginRoute } from '../lib/postLogin';
import { PressScale } from './Press';

// "Please sign in" -- the sheet a guest gets when they try something that
// needs an account (joining a channel, picking a plan).
//
// A sheet over the current screen rather than a jump to the login page, per
// the client's reference flow: the person sees what they were doing, and
// "Not now" or a tap outside leaves them exactly where they were.
//
// `returnTo` is where to land once signed in (lib/postLogin.ts). Without it
// a fresh sign-in goes to Explore, which loses the thing they were doing.

export function LoginSheet({
  visible,
  onClose,
  message = 'Sign in to unlock your full experience. It only takes a moment.',
  returnTo = null,
}: {
  visible: boolean;
  onClose: () => void;
  message?: string;
  returnTo?: Href | null;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const signIn = () => {
    onClose();
    setPostLoginRoute(returnTo);
    router.push('/(auth)/login');
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(220)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.sm }]}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>Please sign in</Text>
          <Text style={styles.text}>{message}</Text>
          <PressScale style={styles.btn} onPress={signIn} haptic="light" accessibilityRole="button">
            <Text style={styles.btnText}>Sign in</Text>
          </PressScale>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.notNow}>
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, alignItems: 'center',
  },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: Colors.borderStrong, marginBottom: Spacing.xl },
  title: { color: Colors.text, fontSize: FontSize.xxl, fontWeight: FontWeight.bold, letterSpacing: -0.3 },
  text: {
    color: Colors.textSecondary, fontSize: FontSize.lg, lineHeight: 22, textAlign: 'center',
    marginTop: Spacing.sm, maxWidth: 320,
  },
  btn: {
    alignSelf: 'stretch', backgroundColor: Colors.brandBlue, borderRadius: Radius.lg,
    paddingVertical: 16, alignItems: 'center', marginTop: Spacing.xl,
  },
  btnText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: FontWeight.bold, letterSpacing: 0.2 },
  notNow: { paddingVertical: Spacing.md, marginTop: Spacing.xs },
  notNowText: { color: Colors.textSecondary, fontSize: FontSize.subhead, fontWeight: FontWeight.semibold },
});
