import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, asyncStoragePersister } from '@/lib/queryClient';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { AgeGate } from '@/features/auth/components/AgeGate';
import { FeedbackHost } from '@/components/ui/Feedback';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useGeoCheck } from '@/hooks/useGeoCheck';
import { ComplianceService } from '@/features/auth/api/complianceApi';
import { Colors } from '@/theme';
import { Icon } from '@/components/ui/Icon';
import { peekPostLoginRoute, setPostLoginRoute } from '@/features/auth/postLoginRoute';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { session, profile, profileChecked, loading, isPaidUser, approvalStatus, isGuest } =
    useAuth();
  const { isBlocked, country, loading: geoLoading } = useGeoCheck();
  const segments = useSegments();
  // Guards the one-shot cold-start redirect below. A ref, not state: flipping
  // it must not trigger another render of the routing effect.
  const didInitialGuestRoute = useRef(false);
  // The plans page is opened once per app launch / sign-in for an account
  // without a plan (see below).
  const didShowPlans = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (loading || geoLoading) return;
    SplashScreen.hideAsync().catch(() => {});
    if (isBlocked) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      // Guests may browse; screens that need an account ask for one themselves. On the first
      // routing decision only, send the guest to Explore (expo-router would otherwise open the
      // Cloud tab, the index route). Leave the auth screens alone so Sign in stays reachable.
      didShowPlans.current = false;
      if (!inAuthGroup && !didInitialGuestRoute.current) {
        didInitialGuestRoute.current = true;
        router.replace('/(tabs)/explore');
      }
      return;
    }

    // Re-arm, so signing out later lands back on Explore rather than wherever
    // the previous session happened to leave off.
    didInitialGuestRoute.current = false;

    // Wait for the (possibly still in-flight) profile fetch before deciding
    // whether this account needs to complete its profile — deciding off a
    // stale/empty `profile` would bounce every fresh sign-in through
    // complete-profile for a frame. See hooks/useAuth.ts `profileChecked`.
    if (!profileChecked) return;

    // `segments` is typed as a 1-tuple under expo-router's typedRoutes, so
    // indexing [1] is a compile error even though it is correct at runtime —
    // this is a nested route and the array really does have a second element.
    // Widening to string[] is the narrowest fix; the alternative (turning
    // typedRoutes off) loses type safety everywhere else.
    const onCompleteProfile = inAuthGroup && (segments as string[])[1] === 'complete-profile';
    // Any account that hasn't accepted the CURRENT policy versions lands
    // here instead of /(tabs) until birth year + terms/guidelines/privacy
    // acceptance are on file. In practice that's existing accounts after a
    // POLICY_VERSIONS bump — see app/(auth)/complete-profile.tsx and
    // lib/compliance.ts.
    if (!ComplianceService.hasAcceptedCurrentPolicies(profile)) {
      if (!onCompleteProfile) router.replace('/(auth)/complete-profile');
      return;
    }

    // Land on Explore (the content tab), named explicitly so a tab reorder cannot change it --
    // unless the person was mid-way through something when asked to sign in (e.g. a plan they
    // picked).
    if (inAuthGroup) {
      router.replace(peekPostLoginRoute() ?? '/(tabs)/explore');
    } else {
      // Signed in, profile complete, and out of the auth screens: the
      // destination has been reached, so it must not fire again.
      setPostLoginRoute(null);

      // Open the plans once per launch/sign-in for accounts without a plan. It can be closed.
      // Skipped when already on it, for rejected accounts (they cannot buy) and while waiting for
      // admin approval. Guests still get it: saving the account is their next step.
      const waitingForApproval = approvalStatus === 'pending' && !isGuest;
      if (
        !didShowPlans.current &&
        !isPaidUser &&
        approvalStatus !== 'rejected' &&
        !waitingForApproval
      ) {
        didShowPlans.current = true;
        if ((segments[0] as string) !== 'premium') router.push('/premium');
      }
    }
  }, [
    session,
    profile,
    profileChecked,
    loading,
    geoLoading,
    isBlocked,
    segments,
    router,
    isPaidUser,
    approvalStatus,
    isGuest,
  ]);

  if (isBlocked && !geoLoading) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
        <StatusBar style="light" />
        <View style={geoStyles.container}>
          <Icon name="lock" size={16} color={Colors.danger} />
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
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}
          >
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="admin"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="notifications"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="create-content"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="edit-profile" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen
              name="save-account"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="delete-account" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="refund-policy" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="community-guidelines" options={{ animation: 'slide_from_right' }} />
          </Stack>

          {/* Guests never reach signup, where the 18+ birth-year check
                lives — so without this, opening the app to visitors would
                remove the only age gate in the product. Signed-in accounts
                already passed that check and are not asked again. */}
          <AgeGate enabled={!session && !loading && !isBlocked} />
          {/* Last child, so branded dialogs/toasts paint over every screen. */}
          <FeedbackHost />
        </GestureHandlerRootView>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}

const geoStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  footer: { marginTop: 40, fontSize: 11, color: Colors.textMuted },
});
