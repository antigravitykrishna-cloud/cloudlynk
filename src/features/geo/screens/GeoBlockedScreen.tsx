import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';

/** Shown instead of the whole app where Cloudlynk is not offered (see useGeoCheck). */
export function GeoBlockedScreen({ country }: { country: string | null }) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <Icon name="lock" size={16} color={Colors.danger} />
        <Text style={styles.title}>Cloudlynk is not available in your region</Text>
        <Text style={styles.message}>
          This app is not available for download or use in your country.
        </Text>
        {country ? <Text style={styles.country}>Country: {country}</Text> : null}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  title: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    textAlign: 'center',
    marginVertical: Spacing.md,
  },
  message: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  country: { marginTop: 40, fontSize: FontSize.xs, color: Colors.textMuted },
});
