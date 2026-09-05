import Constants from 'expo-constants';

export type IapProvider = 'google_play' | 'noop';
export type AppEnv = 'development' | 'staging' | 'production';

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
  sentryDsn: readEnv('SENTRY_DSN'),
  supportEmail: readEnv('SUPPORT_EMAIL', 'support@cloudlynk.app'),
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
