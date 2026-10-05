import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Modal, Easing, Platform, Dimensions,
} from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

// Branded toasts and dialogs, replacing React Native's Alert.alert.
//
// Alert.alert renders the operating system's own dialog. On Android that is a
// square, light-grey Material box with ALL-CAPS text buttons — it ignores the
// app's palette, typography and corner radius entirely. In a dark navy product
// it reads as an unfinished prototype, which is exactly the note we got.
//
// State lives in a module-level store read through useSyncExternalStore rather
// than a React context, matching how hooks/useAuth.ts already shares the
// profile. That means any file can call toast() or confirm() as a plain
// function — including code outside a component — without threading a provider
// through 27 screens.

type ToastKind = 'success' | 'error' | 'info';

type ToastState = { id: number; kind: ToastKind; message: string } | null;

type ConfirmButton = {
  label?: string;
  onPress?: () => void;
  /** 'primary' fills with brand blue, 'danger' with red, 'ghost' is bordered. */
  variant?: 'primary' | 'danger' | 'ghost';

  // Alert.alert's own button shape, accepted as-is. The 152 existing call
  // sites pass { text, style } and migrating them is then a rename of the
  // function, not a rewrite of every button object — which is the difference
  // between a diff that can be reviewed and one that cannot. New code should
  // use label/variant.
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
};

/** Collapse either button shape into what the renderer draws. */
function normalize(b: ConfirmButton, isLast: boolean) {
  const label = b.label ?? b.text ?? 'OK';
  const variant =
    b.variant
    ?? (b.style === 'destructive' ? 'danger'
      : b.style === 'cancel' ? 'ghost'
      // No explicit style: the last button is the affirmative one, matching
      // both Alert.alert's emphasis and the order these calls already use.
      : isLast ? 'primary' : 'ghost');
  return { label, variant, onPress: b.onPress };
}

type ConfirmState = {
  id: number;
  title: string;
  message?: string;
  buttons: ConfirmButton[];
} | null;

// ── store ────────────────────────────────────────────────────────────────
let toastState: ToastState = null;
let confirmState: ConfirmState = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Brief, non-blocking confirmation. Use for "saved", "copied", "sent". */
export function toast(message: string, kind: ToastKind = 'info') {
  toastState = { id: ++seq, kind, message };
  emit();
}

/**
 * A dialog that demands a choice. Mirrors Alert.alert's shape so migrating a
 * call site is a rename plus button objects, not a rewrite.
 *
 * Buttons render in the order given, stacked vertically — an Android dialog
 * squeezes three actions into a horizontal row and truncates them, which is
 * half of why the stock ones look cheap.
 */
export function showAlert(title: string, message?: string, buttons?: ConfirmButton[]) {
  confirmState = {
    id: ++seq,
    title,
    message,
    buttons: buttons?.length ? buttons : [{ label: 'OK', variant: 'primary' }],
  };
  emit();
}

/** Convenience for the very common "something went wrong" case. */
export function alertError(title: string, message?: string) {
  showAlert(title, message, [{ label: 'Close', variant: 'ghost' }]);
}

function dismissConfirm() { confirmState = null; emit(); }
function dismissToast(id: number) {
  if (toastState?.id === id) { toastState = null; emit(); }
}

const getToast = () => toastState;
const getConfirm = () => confirmState;

// ── toast ────────────────────────────────────────────────────────────────
const TOAST_MS = 2600;

function Toast() {
  const state = useSyncExternalStore(subscribe, getToast, getToast);
  const slide = useRef(new Animated.Value(0)).current;
  const idRef = useRef<number | null>(null);

  useEffect(() => {
    if (!state) return;
    idRef.current = state.id;
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const t = setTimeout(() => {
      Animated.timing(slide, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => { if (idRef.current !== null) dismissToast(idRef.current); });
    }, TOAST_MS);
    return () => clearTimeout(t);
  }, [state?.id, slide, state]);

  if (!state) return null;

  const accent =
    state.kind === 'success' ? Colors.success
    : state.kind === 'error' ? Colors.danger
    : Colors.brandCyan;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toastWrap,
        {
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        },
      ]}
    >
      <View style={styles.toast}>
        <View style={[styles.toastBar, { backgroundColor: accent }]} />
        <Text style={styles.toastText} numberOfLines={3}>{state.message}</Text>
      </View>
    </Animated.View>
  );
}

// ── confirm dialog ───────────────────────────────────────────────────────
function ConfirmDialog() {
  const state = useSyncExternalStore(subscribe, getConfirm, getConfirm);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!state) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [state?.id, anim, state]);

  if (!state) return null;

  const press = (b: ConfirmButton) => {
    // Dismiss first so a handler that opens another dialog is not immediately
    // torn down by this one closing.
    dismissConfirm();
    b.onPress?.();
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={dismissConfirm}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.dialog,
            {
              opacity: anim,
              transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            },
          ]}
        >
          <Text style={styles.dialogTitle}>{state.title}</Text>
          {state.message ? <Text style={styles.dialogBody}>{state.message}</Text> : null}

          <View style={styles.dialogButtons}>
            {state.buttons.map((raw, i) => {
              const b = normalize(raw, i === state.buttons.length - 1);
              const variant = b.variant;
              return (
                <TouchableOpacity
                  key={b.label + i}
                  style={[
                    styles.btn,
                    variant === 'primary' && styles.btnPrimary,
                    variant === 'danger' && styles.btnDanger,
                    variant === 'ghost' && styles.btnGhost,
                  ]}
                  onPress={() => press(b)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.btnText,
                      variant === 'primary' && styles.btnTextPrimary,
                      variant === 'danger' && styles.btnTextDanger,
                      variant === 'ghost' && styles.btnTextGhost,
                    ]}
                  >
                    {b.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Mount once, at the root. Renders nothing until something is queued. */
export function FeedbackHost() {
  return (
    <>
      <ConfirmDialog />
      <Toast />
    </>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  // toast
  toastWrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 44,
    left: Spacing.lg, right: Spacing.lg,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingRight: Spacing.lg,
    overflow: 'hidden',
    // A coloured shadow reads as raised on navy where a black one just muddies.
    shadowColor: '#000', shadowOpacity: 0.4,
    shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  toastBar: { width: 4, alignSelf: 'stretch' },
  toastText: {
    flex: 1, color: Colors.text, fontSize: FontSize.base,
    paddingVertical: Spacing.md, paddingLeft: Spacing.md, lineHeight: 19,
  },

  // dialog
  backdrop: {
    flex: 1, backgroundColor: 'rgba(4,8,16,0.72)',
    alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl,
  },
  dialog: {
    width: Math.min(width - Spacing.xl * 2, 380),
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.xxl,
    shadowColor: '#000', shadowOpacity: 0.5,
    shadowRadius: 28, shadowOffset: { width: 0, height: 14 },
    elevation: 24,
  },
  dialogTitle: {
    color: Colors.text, fontSize: FontSize.xl,
    fontWeight: FontWeight.bold, marginBottom: Spacing.sm,
  },
  dialogBody: {
    color: Colors.textSecondary, fontSize: FontSize.lg,
    lineHeight: 22, marginBottom: Spacing.sm,
  },
  dialogButtons: { marginTop: Spacing.lg, gap: Spacing.sm },
  btn: {
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center', justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: Colors.brandBlue },
  btnDanger: { backgroundColor: Colors.danger },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.borderStrong },
  btnText: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  btnTextPrimary: { color: Colors.textInverse, fontWeight: FontWeight.bold },
  btnTextDanger: { color: Colors.white, fontWeight: FontWeight.bold },
  btnTextGhost: { color: Colors.textSecondary },
});
