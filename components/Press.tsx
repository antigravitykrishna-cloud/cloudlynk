import { forwardRef } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

/**
 * The app's press interaction, in one place.
 *
 * react-native-reanimated and expo-haptics were both already dependencies,
 * the babel plugin was already configured, and neither was imported anywhere.
 * Every touchable in the app was a TouchableOpacity doing nothing but fading
 * to `activeOpacity`. That is why taps felt flat: opacity alone reads as "the
 * screen dimmed", where a scale reads as "the thing I touched moved".
 *
 * Two deliberate choices:
 *
 * - **Spring, not timing.** A tap is a physical gesture and a spring settles
 *   the way a real object does. `damping: 15` is just short of critical, so
 *   there is a hint of overshoot on release without a visible wobble.
 *
 * - **Haptics are opt-in per call site, not automatic.** A buzz on every tap
 *   in a scrolling list is worse than none. It is reserved for actions with a
 *   consequence — subscribing, joining, approving, rejecting — where the
 *   feedback confirms something happened. iOS honours the style; Android maps
 *   these onto its own effects, and any failure is swallowed because a device
 *   without a motor must not break the button.
 */
export type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

export function fireHaptic(style: HapticStyle) {
  // Never let feedback break the action it is decorating.
  try {
    switch (style) {
      case 'selection': Haptics.selectionAsync(); break;
      case 'success':   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
      case 'warning':   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); break;
      case 'error':     Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); break;
      case 'heavy':     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
      case 'medium':    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
      default:          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
    }
  } catch {
    // No haptic motor, or permission denied. Not worth surfacing.
  }
}

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** How far to scale on press. Smaller cards need less travel to read. */
  scaleTo?: number;
  /** Omit for ordinary navigation; set it for actions with a consequence. */
  haptic?: HapticStyle;
  children?: React.ReactNode;
};

export const PressScale = forwardRef<React.ComponentRef<typeof Pressable>, Props>(
  function PressScale({ style, scaleTo = 0.97, haptic, onPress, disabled, children, ...rest }, ref) {
    const scale = useSharedValue(1);
    const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        onPressIn={() => {
          scale.value = withSpring(disabled ? 1 : scaleTo, { damping: 15, stiffness: 400, mass: 0.4 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 400, mass: 0.4 });
        }}
        onPress={(e) => {
          if (disabled) return;
          if (haptic) fireHaptic(haptic);
          onPress?.(e);
        }}
        // Android draws its own ripple on top of the scale, which reads as two
        // competing responses to one tap. The scale is the response.
        android_ripple={Platform.OS === 'android' ? null : undefined}
        {...rest}
      >
        <Animated.View style={[style, animated]}>{children}</Animated.View>
      </Pressable>
    );
  },
);
