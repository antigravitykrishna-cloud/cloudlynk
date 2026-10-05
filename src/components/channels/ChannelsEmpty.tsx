import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/theme';
import { CloudlynkLogo } from '@/components/ui/CloudlynkLogo';

/** Shown when the list is empty: a failed load (with retry), signed out on Joined, or no channels. */
export function ChannelsEmpty({
  loadFailed,
  joinedTab,
  signedIn,
  onRetry,
}: {
  loadFailed: boolean;
  joinedTab: boolean;
  signedIn: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <CloudlynkLogo size={48} />
      {loadFailed ? (
        <>
          <Text style={styles.text}>Couldn&apos;t load channels</Text>
          <Text style={styles.hint}>Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </>
      ) : joinedTab && !signedIn ? (
        <>
          <Text style={styles.text}>Not signed in</Text>
          <Text style={styles.hint}>
            Browse every channel in Discover. Sign in to join one and keep it here.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.text}>No channels yet</Text>
          <Text style={styles.hint}>
            {joinedTab
              ? 'Channels you join will appear here.'
              : 'Join a public channel from Explore, or create your own.'}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
  },
  text: { fontSize: 16, color: Colors.text, fontWeight: '600', marginTop: 16 },
  hint: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: Colors.brandBlue,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
});
