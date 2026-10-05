import Constants from 'expo-constants';

export type IapProvider = 'google_play' | 'noop';
export type AppEnv = 'development' | 'staging' | 'production';

/**
 * How UPI / Razorpay / Sabpaisa are offered next to Google Play: 'user_choice' (default; Google's
 * choice screen first, sales reported to Google -- the only mode allowed on Play), 'test' (our
 * sheet directly; sideloaded test APKs only, scripts/audit-apk.mjs rejects it), 'off' (Google Play
 * only).
 */
export type AlternativeBilling = 'user_choice' | 'test' | 'off';

export interface AppConfig {
  appEnv: AppEnv;
  iapProvider: IapProvider;
  googlePlayPackageName: string;
  receiptVerifierUrl: string;
  admobAppId: string;
  admobBannerId: string;
  admobInterstitialId: string;
  admobRewardedId: string;
  geoCheckWorkerUrl: string;
  googleWebClientId: string;
  alternativeBilling: AlternativeBilling;
  metaAppId: string;
  sentryDsn: string;
  supportEmail: string;
  privacyPolicyUrl: string;
  termsUrl: string;
  communityGuidelinesUrl: string;
  refundPolicyUrl: string;
  copyrightPolicyUrl: string;
}

function readEnv(key: string, fallback: string = ''): string {
  return (Constants.expoConfig?.extra as Record<string, string> | undefined)?.[key] ?? fallback;
}

export const config: AppConfig = {
  appEnv: readEnv('APP_ENV', 'development') as AppEnv,
  iapProvider: readEnv('IAP_PROVIDER', 'noop') as IapProvider,
  googlePlayPackageName: readEnv('GOOGLE_PLAY_PACKAGE_NAME'),
  receiptVerifierUrl: readEnv('RECEIPT_VERIFIER_URL'),
  admobAppId: readEnv('ADMOB_APP_ID'),
  admobBannerId: readEnv('ADMOB_BANNER_ID'),
  admobInterstitialId: readEnv('ADMOB_INTERSTITIAL_ID'),
  admobRewardedId: readEnv('ADMOB_REWARDED_ID'),
  // Cloudflare Worker URL from cloudflare/geo-check-worker/ — see hooks/useGeoCheck.ts.
  geoCheckWorkerUrl: readEnv('GEO_CHECK_WORKER_URL'),
  // OAuth 2.0 *Web* client id from Google Cloud, not the Android one. Supabase
  // verifies the ID token against this audience, and the native sign-in
  // returns a token minted for the web client when it is passed as the
  // webClientId. Setup steps are in DEPLOY.md §0.4.
  googleWebClientId: readEnv('GOOGLE_WEB_CLIENT_ID'),
  alternativeBilling: readEnv('ALTERNATIVE_BILLING', 'user_choice') as AlternativeBilling,
  // Meta ad measurement -- lib/metaAds.ts. The native side reads the same
  // value from app.json at build time (android/app/build.gradle).
  metaAppId: readEnv('META_APP_ID'),
  sentryDsn: readEnv('SENTRY_DSN'),
  supportEmail: readEnv('SUPPORT_EMAIL', 'help.cupibs@gmail.com'),
  privacyPolicyUrl: readEnv('PRIVACY_POLICY_URL'),
  termsUrl: readEnv('TERMS_URL'),
  communityGuidelinesUrl: readEnv('COMMUNITY_GUIDELINES_URL'),
  refundPolicyUrl: readEnv('REFUND_POLICY_URL'),
  copyrightPolicyUrl: readEnv('COPYRIGHT_POLICY_URL'),
};

/** True when Google Play IAP is configured with real package name */
export function isIapLive(): boolean {
  return config.iapProvider === 'google_play' && !!config.googlePlayPackageName;
}

/** True when AdMob is configured */
export function isAdmobLive(): boolean {
  return !!config.admobAppId;
}

/** True when Sentry is configured */
export function isSentryLive(): boolean {
  return !!config.sentryDsn;
}

/**
 * True when Google Sign-In is configured (GOOGLE_WEB_CLIENT_ID in app.json `extra`). Otherwise the
 * button is hidden rather than shown broken.
 */
export function isGoogleAuthLive(): boolean {
  return !!config.googleWebClientId;
}
