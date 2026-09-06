import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { config } from '../lib/config';

// Age confirmation for signed-out visitors.
//
// Cloudlynk is 18+ and signup enforces that with a birth-year field
// (app/(auth)/signup.tsx rejects under-18s). But v61 lets people browse without
// an account, and a guest never reaches signup — so without this, guest
// browsing would quietly remove the only age check in the app. Play's UGC and
// mature-content policies expect one on the way in.
//
// A self-attested gate is not identity verification and does not pretend to
// be. It is the standard, expected control, and it is what the reference app
// this was modelled on does.
//
// Only shown to signed-out users: a signed-in account already passed the
// birth-year check at signup, and asking again would be noise.

const STORAGE_KEY = 'cloudlynk.ageConfirmed.v1';

export function AgeGate({ enabled }: { enabled: boolean }) {
  // `null` means "not yet read from storage" — distinct from false, so the
  // modal does not flash open for a returning visitor while the async read is
  // still in flight.
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => { if (!cancelled) setConfirmed(v === 'true'); })
      // A storage failure must not lock anyone out of the app. Treat it as
      // "not yet confirmed" and ask again; the cost is one extra tap.
      .catch(() => { if (!cancelled) setConfirmed(false); });
    return () => { cancelled = true; };
  }, []);

  const accept = async () => {
    setConfirmed(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Non-fatal: they get asked again next launch rather than being blocked.
    }
  };

  if (!enabled || confirmed === null || confirmed) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {declined ? (
            <>
              <Text style={styles.title}>You need to be 18 or older</Text>
              <Text style={styles.body}>
                Cloudlynk hosts content intended for adults, so we can&apos;t let
                you browse. Thanks for being honest.
              </Text>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={() => setDeclined(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.ghostTxt}>Go back</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>Please confirm your age</Text>
              <Text style={styles.body}>
                Cloudlynk is an 18+ platform and may contain content intended for
                adults. Confirm your age to continue.
              </Text>

              <TouchableOpacity style={styles.primaryBtn} onPress={accept} activeOpacity={0.85}>
                <Text style={styles.primaryTxt}>I am 18 or older</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={() => setDeclined(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.ghostTxt}>I am under 18</Text>
              </TouchableOpacity>

              <Text style={styles.legal}>
                Continuing means you accept our{' '}
                <Text
                  style={styles.link}
                  onPress={() => Linking.openURL(config.communityGuidelinesUrl).catch(() => {})}
                >
                  Community Guidelines
                </Text>
                {' '}and{' '}
                <Text
                  style={styles.link}
                  onPress={() => Linking.openURL(config.termsUrl).catch(() => {})}
                >
                  Terms
                </Text>
                .
              </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(4, 8, 16, 0.88)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    padding: Spacing.xxl, paddingBottom: Spacing.xxxl,
    borderTopWidth: 1, borderColor: Colors.border,
  },
  title: {
    color: Colors.text, fontSize: FontSize.xxl, fontWeight: FontWeight.bold,
    textAlign: 'center', marginBottom: Spacing.md,
  },
  body: {
    color: Colors.textSecondary, fontSize: FontSize.lg, lineHeight: 22,
    textAlign: 'center', marginBottom: Spacing.xxl,
  },
  primaryBtn: {
    backgroundColor: Colors.brandBlue, borderRadius: Radius.full,
    paddingVertical: Spacing.lg, alignItems: 'center', marginBottom: Spacing.md,
  },
  primaryTxt: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  ghostBtn: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full,
    paddingVertical: Spacing.lg, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  ghostTxt: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  legal: {
    color: Colors.textMuted, fontSize: FontSize.sm, lineHeight: 18,
    textAlign: 'center', marginTop: Spacing.xl,
  },
  link: { color: Colors.accent, fontWeight: FontWeight.semibold },
});
