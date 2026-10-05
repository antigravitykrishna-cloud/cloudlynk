import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { FeedbackHost } from '@/components/ui/Feedback';
import { asyncStoragePersister, queryClient } from '@/lib/queryClient';
import { Colors } from '@/theme';
import { AgeGate } from '@/features/auth/components/AgeGate';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useLaunchRouting } from '@/features/auth/hooks/useLaunchRouting';
import { useGeoCheck } from '@/features/geo/hooks/useGeoCheck';
import { GeoBlockedScreen } from '@/features/geo/screens/GeoBlockedScreen';

// The app shell: providers, the root navigator, and what sits above every screen (the age gate,
// dialogs and toasts). Where the app navigates as the session changes is useLaunchRouting.

SplashScreen.preventAutoHideAsync();

/** Screens that slide up over the tabs. */
const MODAL = { presentation: 'modal', animation: 'slide_from_bottom' } as const;
/** Screens pushed from a settings list. */
const PUSHED = { animation: 'slide_from_right' } as const;

export default function RootLayout() {
  const { session, loading } = useAuth();
  const geo = useGeoCheck();
  useLaunchRouting({ geoReady: !geo.loading, geoBlocked: geo.isBlocked });

  if (geo.isBlocked && !geo.loading) return <GeoBlockedScreen country={geo.country} />;

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        <GestureHandlerRootView style={styles.root}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: styles.screen }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="admin" options={MODAL} />
            <Stack.Screen name="notifications" options={MODAL} />
            <Stack.Screen name="create-content" options={MODAL} />
            <Stack.Screen name="save-account" options={MODAL} />
            <Stack.Screen name="edit-profile" options={PUSHED} />
            <Stack.Screen name="delete-account" options={PUSHED} />
            <Stack.Screen name="privacy" options={PUSHED} />
            <Stack.Screen name="terms" options={PUSHED} />
            <Stack.Screen name="community-guidelines" options={PUSHED} />
            <Stack.Screen name="refund-policy" options={PUSHED} />
            <Stack.Screen name="copyright" options={PUSHED} />
          </Stack>

          {/* Visitors browse without signing up, where the 18+ check lives, so they are asked
              here. Signed-in accounts already passed it. */}
          <AgeGate enabled={!session && !loading && !geo.isBlocked} />
          {/* Last, so dialogs and toasts paint over every screen. */}
          <FeedbackHost />
        </GestureHandlerRootView>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  screen: { backgroundColor: Colors.bg },
});
