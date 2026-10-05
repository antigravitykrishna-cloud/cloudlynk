import { Dimensions, PixelRatio, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { config } from './config';

// Meta (Facebook) ad measurement: which Meta ads led to installs, sign-ups
// and purchases, so the client's Meta campaigns can optimise for them.
//
// Who sends what -- chosen so nothing is counted twice:
//   installs / app opens          Meta SDK, automatically (MainApplication.kt)
//   Google Play purchases         Meta SDK, automatically (Play Billing)
//   sign-up, checkout started     this file, from the app
//   UPI / Razorpay / Sabpaisa     the payments server, via Meta's Conversions
//                                 API, once the payment is confirmed -- the
//                                 app may be closed by then, and a purchase
//                                 the server has not confirmed is not one.
//
// Nothing here runs unless META_APP_ID is set in app.json AND the person has
// not turned "Ad measurement" off in Settings. The SDK module is required
// lazily: merely importing it starts a native logger that needs the SDK to be
// initialised, which it is not in a build without an app ID.

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

function sdk(): any {
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
  try { await AsyncStorage.setItem(OPT_KEY, on ? 'on' : 'off'); } catch { /* best effort */ }
  if (!metaConfigured()) return;
  try {
    const { Settings } = sdk();
    Settings.setAutoLogAppEventsEnabled(on);
    Settings.setAdvertiserIDCollectionEnabled(on);
  } catch { /* SDK not started */ }
}

/** A new account finished sign-up (after the age / policy step). */
export async function logRegistration(method: 'email' | 'google' | 'guest'): Promise<void> {
  if (!(await allowed())) return;
  try {
    const { AppEventsLogger } = sdk();
    AppEventsLogger.logEvent(AppEventsLogger.AppEvents.CompletedRegistration, {
      [AppEventsLogger.AppEventParams.RegistrationMethod]: method,
    });
  } catch { /* never let measurement break sign-up */ }
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
  } catch { /* ignore */ }
}

export interface MetaDeviceSignals {
  anonId: string | null;
  advertiserId: string | null;
  extinfo: string[];
}

/**
 * What Meta's Conversions API needs to tie a server-reported purchase back
 * to this phone (and so to the ad that brought it): the SDK's anonymous ID,
 * the advertising ID, and Meta's 16-field "extinfo" device description.
 * Sent with each gateway order; null when measurement is off.
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
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();
    const locale = (() => { try { return Intl.DateTimeFormat().resolvedOptions().locale.replace('-', '_'); } catch { return 'en_IN'; } })();
    const android = Constants.expoConfig?.android as { package?: string; versionCode?: number } | undefined;
    const extinfo = [
      'a2',                                        // Android
      android?.package ?? 'com.cloudlynk.app',
      String(android?.versionCode ?? ''),
      Constants.expoConfig?.version ?? '',
      String(Platform.Version ?? ''),
      '',                                          // device model
      locale,
      '',                                          // timezone abbreviation
      '',                                          // carrier
      String(Math.round(width)),
      String(Math.round(height)),
      PixelRatio.get().toFixed(2),
      '',                                          // CPU cores
      '',                                          // storage size
      '',                                          // free storage
      tz,
    ];
    return { anonId: anonId ?? null, advertiserId: advertiserId ?? null, extinfo };
  } catch {
    return null;
  }
}
