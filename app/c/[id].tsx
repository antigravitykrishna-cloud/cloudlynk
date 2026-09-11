import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/theme';

/**
 * Campaign landing route: https://thecloudlynk.com/c/<channel-id>
 *
 * This is the compliant replacement for the client's "verify by IP/source,
 * then grant access to hidden channels". An ad link opens the app directly on
 * the channel it advertised, so the campaign decides WHERE SOMEONE STARTS —
 * never WHAT EXISTS, and never what they are entitled to.
 *
 * That distinction is the whole point, so it is enforced structurally rather
 * than by convention:
 *
 *   - This route only calls router.replace. It cannot grant anything; there is
 *     no entitlement code here to get it wrong later.
 *   - It sends everyone to the same destination the Channels tab does, so an
 *     ad visitor and an organic visitor land on identical screens and hit the
 *     identical paywall.
 *   - Nothing about the arrival is recorded. Storing the campaign would be
 *     harmless on its own, but `profiles.acquisition_source` is the column the
 *     removed cloaking system used (v46, and Finding 0 in
 *     docs/PLAY_STORE_COMPLIANCE_AUDIT.md). Leaving it untouched means there is
 *     no half-populated field for a future change to start reading again.
 *     It also keeps the Data Safety declaration accurate: no IP, no location,
 *     nothing new collected.
 *
 * `replace`, not `push`: the landing route should not sit in the back stack,
 * or pressing back from the channel returns to a spinner.
 */
export default function CampaignLanding() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (typeof id === 'string' && id.length > 0) {
      router.replace({ pathname: '/(tabs)/channels/[id]', params: { id } });
    } else {
      // A malformed link should open the app, not strand the user on a
      // spinner. Explore is where a session-less launch lands anyway.
      router.replace('/(tabs)/explore');
    }
  }, [id, router]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={Colors.brandBlue} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
});
