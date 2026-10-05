import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { showAlert } from '@/components/ui/Feedback';
import { useRouter, type Href } from 'expo-router';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Spacing, withAlpha } from '@/theme';
import { setPostLoginRoute } from '@/features/auth/postLoginRoute';
import { Button, TextButton } from '@/components/ui/Button';
import { errorMessage } from '@/utils/errors';

// "Please sign in" sheet shown when a guest tries something that needs an account. It opens over
// the current screen, so "Not now" leaves them where they were. `returnTo` is where to go after
// signing in (lib/auth/postLogin.ts).

export function LoginSheet({
  visible,
  onClose,
  message = 'Sign in to unlock your full experience. It only takes a moment.',
  returnTo = null,
  allowGuest = true,
}: {
  visible: boolean;
  onClose: () => void;
  message?: string;
  returnTo?: Href | null;
  /** False where a guest account could not do the thing anyway (joining). */
  allowGuest?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInAsGuest } = useAuth();
  const [guestBusy, setGuestBusy] = useState(false);

  const signIn = () => {
    onClose();
    setPostLoginRoute(returnTo);
    router.push('/(auth)/login');
  };

  // A guest ID on the spot, then straight back to what they were doing.
  const continueAsGuest = async () => {
    setGuestBusy(true);
    setPostLoginRoute(returnTo);
    try {
      await signInAsGuest();
      onClose();
    } catch (err) {
      setPostLoginRoute(null);
      showAlert('Could not continue as guest', errorMessage(err, 'Please try again.'));
    } finally {
      setGuestBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(220)}
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.sm },
          ]}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>Please sign in</Text>
          <Text style={styles.text}>{message}</Text>
          <Button
            label="Sign in"
            size="lg"
            haptic="light"
            onPress={signIn}
            style={styles.firstChoice}
          />
          {allowGuest && (
            <Button
              label="Continue as guest"
              variant="secondary"
              size="lg"
              onPress={continueAsGuest}
              busy={guestBusy}
              style={styles.choice}
            />
          )}
          <TextButton label="Not now" tone="muted" onPress={onClose} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: withAlpha(Colors.black, 0.55), justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    alignItems: 'center',
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.borderStrong,
    marginBottom: Spacing.xl,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.3,
  },
  text: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: Spacing.sm,
    maxWidth: 320,
  },
  firstChoice: { alignSelf: 'stretch', marginTop: Spacing.xl },
  choice: { alignSelf: 'stretch', marginTop: Spacing.sm },
});
