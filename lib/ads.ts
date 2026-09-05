/**
 * AdMob integration — real, not a stub.
 *
 * Renders/serves ads once `ads_enabled=true` and the relevant ad unit ID is
 * set in `app_settings` (see `lib/adsConfig.ts` for the full read/write
 * contract and the App-ID-vs-ad-unit-ID caveat — TL;DR: ad unit IDs are
 * dynamic, the AdMob App ID itself needs one native rebuild).
 *
 * The native module (`react-native-google-mobile-ads`) is lazy-required so
 * this file doesn't crash to import in a context where it isn't linked (e.g.
 * Expo Go, or before the first `expo prebuild`).
 */

import React from 'react';
import { useAdConfig, getAdConfig } from './adsConfig';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RNAds: any = null;
function getRNAds() {
  if (RNAds === null) {
    try {
      RNAds = require('react-native-google-mobile-ads');
    } catch {
      RNAds = false;
    }
  }
  return RNAds || null;
}

/**
 * Drop-in banner. Renders nothing until ads are enabled AND a banner ad unit
 * ID is configured — safe to mount unconditionally anywhere in the tree.
 */
export function AdBanner({ style }: { style?: object }) {
  const { data: config } = useAdConfig();
  const mod = getRNAds();
  if (!config?.enabled || !config.bannerId || !mod?.BannerAd) return null;

  const { BannerAd, BannerAdSize } = mod;
  // Plain .ts file (no JSX) — React.createElement instead of <BannerAd ... />.
  return React.createElement(BannerAd, {
    unitId: config.bannerId,
    size: BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
    style,
  });
}

/**
 * Loads + shows a rewarded ad, resolving once the user earns the reward (or
 * false if ads are off/unconfigured, fail to load, or the user dismisses
 * without completing it).
 */
export async function showRewardedAd(): Promise<{ rewarded: boolean; rewardType?: string; rewardAmount?: number }> {
  const config = await getAdConfig();
  const mod = getRNAds();
  if (!config.enabled || !config.rewardedId || !mod) return { rewarded: false };

  const { RewardedAd, RewardedAdEventType, AdEventType } = mod;
  return new Promise((resolve) => {
    const rewarded = RewardedAd.createForAdRequest(config.rewardedId);
    let earned: { rewardType?: string; rewardAmount?: number } | null = null;

    const cleanup = () => {
      unsubLoaded(); unsubEarned(); unsubClosed(); unsubError();
    };
    const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => rewarded.show());
    const unsubEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward: { type: string; amount: number }) => {
      earned = { rewardType: reward.type, rewardAmount: reward.amount };
    });
    const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      cleanup();
      resolve(earned ? { rewarded: true, ...earned } : { rewarded: false });
    });
    const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, () => {
      cleanup();
      resolve({ rewarded: false });
    });

    rewarded.load();
  });
}

/** Loads + shows an interstitial, resolving true once it's been shown and closed. */
export async function showInterstitialAd(): Promise<boolean> {
  const config = await getAdConfig();
  const mod = getRNAds();
  if (!config.enabled || !config.interstitialId || !mod) return false;

  const { InterstitialAd, AdEventType } = mod;
  return new Promise((resolve) => {
    const interstitial = InterstitialAd.createForAdRequest(config.interstitialId);
    const cleanup = () => { unsubLoaded(); unsubClosed(); unsubError(); };
    const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => interstitial.show());
    const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => { cleanup(); resolve(true); });
    const unsubError = interstitial.addAdEventListener(AdEventType.ERROR, () => { cleanup(); resolve(false); });
    interstitial.load();
  });
}
