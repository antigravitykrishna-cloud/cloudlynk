import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/theme';

/**
 * Campaign landing route: https://thecloudlynk.com/c/<channel-id>. Opens the advertised channel --
 * the same screen and the same rules as reaching it from the Channels tab. It grants nothing and
 * records nothing about the arrival. `replace` keeps this spinner out of the back stack.
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
