import { useEffect, useRef } from 'react';
import { useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { shouldOfferPlans } from '@/features/auth/launchRouting';
import { hasAcceptedCurrentPolicies } from '@/features/auth/policies';
import { peekPostLoginRoute, setPostLoginRoute } from '@/features/auth/postLoginRoute';

/**
 * Where the app goes as the session changes, and when the splash screen hides:
 *
 *   signed out        Explore, once per launch (expo-router would otherwise open the Cloud tab).
 *                     The auth screens are left alone so Sign in stays reachable.
 *   policies missing  complete-profile, until birth year and the current policy versions are on
 *                     file (fresh accounts, and everyone after a POLICY_VERSIONS bump).
 *   just signed in    wherever they were headed when asked to sign in (a plan they picked), else
 *                     Explore.
 *   signed in         the plans, once per launch or sign-in, for accounts that may buy one.
 */
export function useLaunchRouting({
  geoReady,
  geoBlocked,
}: {
  geoReady: boolean;
  geoBlocked: boolean;
}) {
  const router = useRouter();
  const segments = useSegments();
  const { session, profile, profileChecked, loading, isPaidUser, approvalStatus, isGuest } =
    useAuth();
  // Refs, not state: flipping them must not re-run the effect.
  const routedGuest = useRef(false);
  const offeredPlans = useRef(false);

  useEffect(() => {
    if (loading || !geoReady) return;
    SplashScreen.hideAsync().catch(() => {});
    if (geoBlocked) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      offeredPlans.current = false;
      if (!inAuthGroup && !routedGuest.current) {
        routedGuest.current = true;
        router.replace('/(tabs)/explore');
      }
      return;
    }
    // Re-arm, so signing out later lands on Explore again.
    routedGuest.current = false;

    // Deciding off a profile still loading would bounce every fresh sign-in through
    // complete-profile for a frame.
    if (!profileChecked) return;

    // typedRoutes types segments as a 1-tuple; this nested route really has a second element.
    const onCompleteProfile = inAuthGroup && (segments as string[])[1] === 'complete-profile';
    if (!hasAcceptedCurrentPolicies(profile)) {
      if (!onCompleteProfile) router.replace('/(auth)/complete-profile');
      return;
    }

    if (inAuthGroup) {
      router.replace(peekPostLoginRoute() ?? '/(tabs)/explore');
      return;
    }
    // Arrived: the post-login destination must not fire again.
    setPostLoginRoute(null);

    if (!offeredPlans.current && shouldOfferPlans({ isPaidUser, approvalStatus, isGuest })) {
      offeredPlans.current = true;
      if ((segments[0] as string) !== 'premium') router.push('/premium');
    }
  }, [
    session,
    profile,
    profileChecked,
    loading,
    geoReady,
    geoBlocked,
    segments,
    router,
    isPaidUser,
    approvalStatus,
    isGuest,
  ]);
}
