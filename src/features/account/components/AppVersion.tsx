import { StyleSheet, Text } from 'react-native';
import Constants from 'expo-constants';
import { Colors, FontSize } from '@/theme';

/** "Cloudlynk · v1.2.3" and the copyright line. */
export function AppVersion() {
  const version = Constants.expoConfig?.version ?? '0.0.0';
  return (
    <Text style={styles.version}>
      {`Cloudlynk · v${version}\n© 2026 Cloudlynk Inc. All rights reserved.`}
    </Text>
  );
}

const styles = StyleSheet.create({
  version: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: 32,
  },
});
