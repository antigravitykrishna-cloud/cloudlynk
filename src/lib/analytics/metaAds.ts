import { Dimensions, PixelRatio, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { config } from '@/lib/config';

// Meta ad measurement: which Meta ads led to installs, sign-ups and purchases. Installs, app opens
// and Google Play purchases are logged by the Meta SDK automatically; sign-up and checkout-started
// are logged here; UPI / card purchases are reported by the payments server (Conversions API) once
// confirmed. Nothing runs unless META_APP_ID is set and the person has not turned "Ad measurement"
// off. The SDK is loaded lazily because importing it starts a native logger.

const OPT_KEY = 'cloudlynk.metaMeasurement';
let optedOut: boolean | null = null;

export function metaConfigured(): boolean {
  return Platform.OS === 'android' && !!config.metaAppId;
}

async function allowed(): Promise<boolean> {
  if (!metaConfigured()) return false;
  if (optedOut === null) {
    try {
      optedOut = (await AsyncStorage.getItem(OPT_KEY)) === 'off';
    } catch {
      optedOut = false;
    }
  }
  return !optedOut;
}

function sdk(): typeof import('react-native-fbsdk-next') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, loaded on first use
  return require('react-native-fbsdk-next');
}

export async function getMetaMeasurement(): Promise<boolean> {
  return allowed();
}

/**
 * The Settings toggle. The SDK keeps these two switches in its own storage,
 * so turning measurement off also stops the automatic install/open/Play
 * purchase events on later launches, before any JavaScript runs.
 */
export async function setMetaMeasurement(on: boolean): Promise<void> {
  optedOut = !on;
  try {
    await AsyncStorage.setItem(OPT_KEY, on ? 'on' : 'off');
  } catch {
    /* best effort */
  }
  if (!metaConfigured()) return;
  try {
    const { Settings } = sdk();
    Settings.setAutoLogAppEventsEnabled(on);
    Settings.setAdvertiserIDCollectionEnabled(on);
  } catch {
    /* SDK not started */
  }
}

/** A new account finished sign-up (after the age / policy step). */
export async function logRegistration(method: 'email' | 'google' | 'guest'): Promise<void> {
  if (!(await allowed())) return;
  try {
    const { AppEventsLogger } = sdk();
    AppEventsLogger.logEvent(AppEventsLogger.AppEvents.CompletedRegistration, {
      [AppEventsLogger.AppEventParams.RegistrationMethod]: method,
    });
  } catch {
    /* never let measurement break sign-up */
  }
}

/** The person pressed Pay on a plan. */
export async function logCheckoutStarted(planCode: string, priceInr: number): Promise<void> {
  if (!(await allowed())) return;
  try {
    const { AppEventsLogger } = sdk();
    AppEventsLogger.logEvent(AppEventsLogger.AppEvents.InitiatedCheckout, priceInr, {
      [AppEventsLogger.AppEventParams.Currency]: 'INR',
      [AppEventsLogger.AppEventParams.ContentID]: planCode,
      [AppEventsLogger.AppEventParams.ContentType]: 'subscription',
    });
  } catch {
    /* ignore */
  }
}

export interface MetaDeviceSignals {
  anonId: string | null;
  advertiserId: string | null;
  extinfo: string[];
}

/**
 * What Meta's Conversions API needs to match a server-reported purchase to this phone: the SDK's
 * anonymous id, the advertising id and Meta's device description. Null when measurement is off.
 */
export async function metaDeviceSignals(): Promise<MetaDeviceSignals | null> {
  if (!(await allowed())) return null;
  try {
    const { AppEventsLogger } = sdk();
    const [anonId, advertiserId] = await Promise.all([
      AppEventsLogger.getAnonymousID().catch(() => null),
      AppEventsLogger.getAdvertiserID().catch(() => null),
    ]);
    const { width, height } = Dimensions.get('screen');
    const tz = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return '';
      }
    })();
    const locale = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().locale.replace('-', '_');
      } catch {
        return 'en_IN';
      }
    })();
    const android = Constants.expoConfig?.android as
      { package?: string; versionCode?: number } | undefined;
    const extinfo = [
      'a2', // Android
      android?.package ?? 'com.cloudlynk.app',
      String(android?.versionCode ?? ''),
      Constants.expoConfig?.version ?? '',
      String(Platform.Version ?? ''),
      '', // device model
      locale,
      '', // timezone abbreviation
      '', // carrier
      String(Math.round(width)),
      String(Math.round(height)),
      PixelRatio.get().toFixed(2),
      '', // CPU cores
      '', // storage size
      '', // free storage
      tz,
    ];
    return { anonId: anonId ?? null, advertiserId: advertiserId ?? null, extinfo };
  } catch {
    return null;
  }
}
