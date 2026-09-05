import { Platform } from 'react-native';
import { config, isIapLive } from '../config';
import { IIapService, IapProduct, PurchaseResult } from './types';

// The four Cloudlynk Premium plans. They all share ONE Play Console
// subscription product (`cloudlynk_premium`) and are distinguished by
// `basePlanId`, not by product id. The `code` deliberately equals the
// `basePlanId` string so there is one naming scheme, not two — the DB
// `subscription_plans.code` column (see the v53 migration) must match these
// exactly, since app/premium.tsx passes `selectedPlan.code` straight into
// purchasePlan(). See BACKEND_REFERENCE.md "Payments — Google Play Billing".
const PREMIUM_PRODUCT_ID = 'cloudlynk_premium';
const DEFAULT_PLANS: IapProduct[] = [
  { code: 'silver-7d', name: 'Silver', description: '7-day access', durationDays: 7, priceInr: 199, iapProductId: PREMIUM_PRODUCT_ID, basePlanId: 'silver-7d', isPopular: false, sortOrder: 1 },
  { code: 'gold-1m', name: 'Gold', description: '1-month access', durationDays: 30, priceInr: 259, iapProductId: PREMIUM_PRODUCT_ID, basePlanId: 'gold-1m', isPopular: true, sortOrder: 2 },
  { code: 'platinum-6m', name: 'Platinum', description: '6-month access', durationDays: 180, priceInr: 599, iapProductId: PREMIUM_PRODUCT_ID, basePlanId: 'platinum-6m', isPopular: false, sortOrder: 3 },
  { code: 'diamond-1y', name: 'Diamond', description: '1-year access', durationDays: 365, priceInr: 999, iapProductId: PREMIUM_PRODUCT_ID, basePlanId: 'diamond-1y', isPopular: false, sortOrder: 4 },
];

export class NoOpIapService implements IIapService {
  async getProducts(): Promise<IapProduct[]> {
    return DEFAULT_PLANS;
  }
  async purchasePlan(planCode: string): Promise<PurchaseResult> {
    return { success: false, planCode, purchaseToken: null, expiresAt: null, errorMessage: 'Premium purchases are not available yet — check back soon.' };
  }
  async restorePurchases(): Promise<PurchaseResult[]> {
    return [];
  }
  async verifyReceipt(purchaseToken: string, planCode?: string): Promise<PurchaseResult> {
    return { success: false, planCode: planCode ?? '', purchaseToken, expiresAt: null, errorMessage: 'No receipt verifier configured.' };
  }
}

/**
 * Real Google Play Billing via `react-native-iap` (OpenIAP-based, v14+ API —
 * this is an event-driven library: `requestPurchase` does NOT resolve with
 * the purchase, results arrive via `purchaseUpdatedListener` /
 * `purchaseErrorListener`; see node_modules/react-native-iap's index.d.ts if
 * this ever needs re-checking against a newer installed version).
 *
 * This satisfies Play's Payments policy for digital subscriptions — content
 * unlocked inside the app must be paid for through Play Billing, never an
 * alternate payment method. Cloudlynk ships with Play Billing as its only
 * purchase path (the earlier UPI/manual-approval flow was removed entirely).
 *
 * Three things must exist OUTSIDE this code before purchases will actually
 * work in production, and none of them can be done from here:
 *   1. The `cloudlynk_premium` subscription product must exist in Play
 *      Console (Monetize > Subscriptions) with one base plan per entry in
 *      DEFAULT_PLANS, each base plan id matching that entry's `basePlanId`
 *      and its price/duration, and the app must be in at least Internal
 *      Testing. These are AUTO-RENEWING base plans (confirmed by the owner) —
 *      the Play Console base plan type must be set to auto-renewing, matching
 *      the auto-renewing-subscription language already shipped in
 *      supabase/functions/legal-pages/terms.ts and refund.ts.
 *   2. A server-side receipt verifier: `verifyReceipt` below calls
 *      `config.receiptVerifierUrl`, which must be a deployed Supabase Edge
 *      Function (`verify-play-receipt`) that calls the Play Developer API
 *      using a service-account key — Play purchase tokens must never be
 *      trusted client-side, since a rooted device can fabricate a
 *      "successful" local purchase result.
 *   3. `config.googlePlayPackageName` and `IAP_PROVIDER=google_play` must be
 *      set for `isIapLive()` to select this service instead of NoOpIapService.
 */
export class GooglePlayIapService implements IIapService {
  async getProducts(): Promise<IapProduct[]> {
    return DEFAULT_PLANS;
  }

  /**
   * Wraps the event-driven purchase flow in a promise: calls `dispatch()`
   * (the `requestPurchase` call) to kick off the native flow, then resolves
   * with the `Purchase` matching `productId` once `purchaseUpdatedListener`
   * fires, rejects on `purchaseErrorListener` OR if `dispatch()` itself
   * throws (e.g. a synchronous `E_NOT_PREPARED`), and times out after 5
   * minutes in case the user backgrounds the app mid-flow without canceling.
   * Whichever of those settles first tears down both listeners.
   */
  private awaitPurchaseResult(RNIap: any, productId: string, dispatch: () => Promise<unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        updateSub.remove();
        errorSub.remove();
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Purchase timed out.'));
      }, 5 * 60 * 1000);

      const updateSub = RNIap.purchaseUpdatedListener((purchase: any) => {
        if (settled || purchase?.productId !== productId) return;
        settled = true;
        cleanup();
        resolve(purchase);
      });
      const errorSub = RNIap.purchaseErrorListener((error: any) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(error?.message ?? 'Purchase failed or was cancelled.'));
      });

      dispatch().catch((err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  async purchasePlan(planCode: string): Promise<PurchaseResult> {
    if (Platform.OS !== 'android') {
      return { success: false, planCode, purchaseToken: null, expiresAt: null, errorMessage: 'Google Play Billing is Android-only.' };
    }
    const plan = DEFAULT_PLANS.find(p => p.code === planCode);
    if (!plan?.iapProductId) {
      return { success: false, planCode, purchaseToken: null, expiresAt: null, errorMessage: `No Play product configured for plan "${planCode}".` };
    }
    try {
      // Lazy-required so the native module is only touched on Android, and so
      // this file still loads in environments without the native module linked
      // (e.g. Expo Go, or before a dev build has been rebuilt).
      const RNIap = require('react-native-iap');
      await RNIap.initConnection();
      try {
        const products = await RNIap.fetchProducts({ skus: [plan.iapProductId], type: 'subs' });
        const product = Array.isArray(products) ? products[0] : null;
        // All 4 plans share one product, so pick the offer whose base plan
        // matches this plan — index 0 would silently buy whichever base plan
        // Play happened to list first.
        const offerToken: string | undefined = product?.subscriptionOfferDetailsAndroid
          ?.find((o: any) => o?.basePlanId === plan.basePlanId)?.offerToken;
        if (!offerToken) {
          return { success: false, planCode, purchaseToken: null, expiresAt: null, errorMessage: `The "${plan.basePlanId}" base plan isn't live in Play Console yet.` };
        }

        const purchase = await this.awaitPurchaseResult(RNIap, plan.iapProductId, () =>
          RNIap.requestPurchase({
            request: { google: { skus: [plan.iapProductId], subscriptionOffers: [{ sku: plan.iapProductId, offerToken }] } },
            type: 'subs',
          })
        );

        const purchaseToken: string | null = purchase?.purchaseToken ?? null;
        if (!purchaseToken) {
          return { success: false, planCode, purchaseToken: null, expiresAt: null, errorMessage: 'Purchase completed but no token was returned.' };
        }

        // The purchase is NOT considered final here — verifyReceipt (server-side)
        // decides success. Only finish (acknowledge) the transaction once the
        // server confirms it's genuine, so a forged/failed verification never
        // gets waved through by an over-eager client-side acknowledgment.
        const verified = await this.verifyReceipt(purchaseToken, planCode);
        if (verified.success) {
          try {
            await RNIap.finishTransaction({ purchase, isConsumable: false });
          } catch (finishErr) {
            // Acknowledgment failing here isn't fatal to the user's purchase —
            // the server already granted access, and verify-play-receipt also
            // acknowledges server-side as a second, more reliable path. Log and move on.
            console.error('IAP: finishTransaction failed after successful verification:', finishErr);
          }
        }
        return verified;
      } finally {
        await RNIap.endConnection();
      }
    } catch (err: any) {
      return { success: false, planCode, purchaseToken: null, expiresAt: null, errorMessage: err?.message ?? 'Google Play purchase failed.' };
    }
  }

  async restorePurchases(): Promise<PurchaseResult[]> {
    if (Platform.OS !== 'android') return [];
    try {
      const RNIap = require('react-native-iap');
      await RNIap.initConnection();
      try {
        const purchases: any[] = await RNIap.getAvailablePurchases();
        const results: PurchaseResult[] = [];
        for (const purchase of purchases) {
          const token = purchase?.purchaseToken ?? null;
          // All 4 plans share one product id, so the product id can't tell
          // us which plan this is — don't resolve it client-side. Pass the
          // base plan id react-native-iap reports (advisory only) and let
          // verify-play-receipt derive the authoritative plan from Google.
          if (token && purchase?.productId === PREMIUM_PRODUCT_ID) {
            const verified = await this.verifyReceipt(token, purchase?.basePlanIdAndroid ?? undefined);
            if (verified.success) {
              try {
                await RNIap.finishTransaction({ purchase, isConsumable: false });
              } catch {
                // Non-fatal — see comment in purchasePlan().
              }
            }
            results.push(verified);
          }
        }
        return results;
      } finally {
        await RNIap.endConnection();
      }
    } catch {
      return [];
    }
  }

  async verifyReceipt(purchaseToken: string, planCode?: string): Promise<PurchaseResult> {
    const claimed = planCode ?? '';
    if (!config.receiptVerifierUrl) {
      return { success: false, planCode: claimed, purchaseToken, expiresAt: null, errorMessage: 'RECEIPT_VERIFIER_URL is not configured — set up the server-side Play receipt verifier before going live.' };
    }
    try {
      const res = await fetch(config.receiptVerifierUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `planCode` is advisory — the server derives the real plan from
        // Google's record of the token and returns it as `json.planCode`.
        body: JSON.stringify({ purchaseToken, planCode, packageName: config.googlePlayPackageName }),
      });
      const json = await res.json();
      if (!res.ok || !json?.valid) {
        return { success: false, planCode: claimed, purchaseToken, expiresAt: null, errorMessage: json?.error ?? 'Receipt verification failed.' };
      }
      return { success: true, planCode: json.planCode ?? claimed, purchaseToken, expiresAt: json.expiresAt ?? null };
    } catch (err: any) {
      return { success: false, planCode: claimed, purchaseToken, expiresAt: null, errorMessage: err?.message ?? 'Could not reach the receipt verifier.' };
    }
  }
}

export function getIapService(): IIapService {
  if (isIapLive()) return new GooglePlayIapService();
  return new NoOpIapService();
}
