import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, asyncStoragePersister } from '../lib/queryClient';
import { ServiceProvider, createServices } from '../lib/services';
import ErrorBoundary from '../components/ErrorBoundary';
import { useAuth } from '../hooks/useAuth';
import { useGeoCheck } from '../hooks/useGeoCheck';
import { ComplianceService } from '../lib/compliance';
import { Colors } from '../constants/theme';

SplashScreen.preventAutoHideAsync();

const services = createServices();

export default function RootLayout() {
  const { session, profile, profileChecked, loading } = useAuth();
  const { isBlocked, country, loading: geoLoading } = useGeoCheck();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || geoLoading) return;
    SplashScreen.hideAsync().catch(() => {});
    if (isBlocked) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // Wait for the (possibly still in-flight) profile fetch before deciding
    // whether this account needs to complete its profile — deciding off a
    // stale/empty `profile` would bounce every fresh sign-in through
    // complete-profile for a frame. See hooks/useAuth.ts `profileChecked`.
    if (!profileChecked) return;

    const onCompleteProfile = inAuthGroup && segments[1] === 'complete-profile';
    // Any account that hasn't accepted the CURRENT policy versions lands
    // here instead of /(tabs) until birth year + terms/guidelines/privacy
    // acceptance are on file. In practice that's existing accounts after a
    // POLICY_VERSIONS bump — see app/(auth)/complete-profile.tsx and
    // lib/compliance.ts.
    if (!ComplianceService.hasAcceptedCurrentPolicies(profile)) {
      if (!onCompleteProfile) router.replace('/(auth)/complete-profile');
      return;
    }

    if (inAuthGroup) router.replace('/(tabs)');
  }, [session, profile, profileChecked, loading, geoLoading, isBlocked, segments, router]);

  if (isBlocked && !geoLoading) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
        <StatusBar style="light" />
        <View style={geoStyles.container}>
          <Text style={geoStyles.icon}>🚫</Text>
          <Text style={geoStyles.title}>Cloudlynk is not available in your region</Text>
          <Text style={geoStyles.subtitle}>
            This app is not available for download or use in your country.
          </Text>
          {country && <Text style={geoStyles.footer}>Country: {country}</Text>}
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        <ServiceProvider value={services}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="admin" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="notifications" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="create-content" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="delete-account" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="refund-policy" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="community-guidelines" options={{ animation: 'slide_from_right' }} />
            </Stack>
          </GestureHandlerRootView>
        </ServiceProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}

const geoStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  icon: { fontSize: 60, marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '800', color: '#e6edf3', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 14, color: '#8b949e', textAlign: 'center', lineHeight: 22 },
  footer: { marginTop: 40, fontSize: 11, color: '#484f58' },
});
