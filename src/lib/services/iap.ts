import { supabase } from '@/lib/supabase';
import { Platform } from 'react-native';
import { config, isIapLive } from '@/lib/config';
import { IIapService, IapProduct, PurchaseResult } from './types';
import { errorMessage } from '@/lib/errors';
import type { Purchase } from 'react-native-iap';

type RNIapModule = typeof import('react-native-iap');

// What a purchase attempt ends with: a Play purchase, or (user choice billing) a token for the
// app's own payment flow.
type PurchaseOutcome =
  { kind: 'purchase'; purchase: Purchase } | { kind: 'alternative'; token: string };

// Lazy-required so the native module is only touched on Android, and so this file still loads
// in environments without it linked (Expo Go, or before a dev build has been rebuilt).
function loadIap(): RNIapModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, loaded on first use
  return require('react-native-iap') as RNIapModule;
}

// The Premium plans. They share one Play Console subscription product (`cloudlynk_premium`) and
// differ by base plan. `code` equals the base plan id and must match subscription_plans.code in the
// database.
const PREMIUM_PRODUCT_ID = 'cloudlynk_premium';
const DEFAULT_PLANS: IapProduct[] = [
  // Play base plan 'trial-3d' must be PREPAID: Play cannot auto-renew every 3 days.
  {
    code: 'trial',
    name: 'Trial',
    description: '3-day access',
    durationDays: 3,
    priceInr: 99,
    iapProductId: PREMIUM_PRODUCT_ID,
    basePlanId: 'trial-3d',
    isPopular: false,
    sortOrder: 0,
  },
  {
    code: 'silver-7d',
    name: 'Silver',
    description: '7-day access',
    durationDays: 7,
    priceInr: 149,
    iapProductId: PREMIUM_PRODUCT_ID,
    basePlanId: 'silver-7d',
    isPopular: false,
    sortOrder: 1,
  },
  {
    code: 'gold-1m',
    name: 'Gold',
    description: '1-month access',
    durationDays: 30,
    priceInr: 259,
    iapProductId: PREMIUM_PRODUCT_ID,
    basePlanId: 'gold-1m',
    isPopular: true,
    sortOrder: 2,
  },
  {
    code: 'platinum-6m',
    name: 'Platinum',
    description: '6-month access',
    durationDays: 180,
    priceInr: 599,
    iapProductId: PREMIUM_PRODUCT_ID,
    basePlanId: 'platinum-6m',
    isPopular: false,
    sortOrder: 3,
  },
  {
    code: 'diamond-1y',
    name: 'Diamond',
    description: '1-year access',
    durationDays: 365,
    priceInr: 999,
    iapProductId: PREMIUM_PRODUCT_ID,
    basePlanId: 'diamond-1y',
    isPopular: false,
    sortOrder: 4,
  },
];

export class NoOpIapService implements IIapService {
  async getProducts(): Promise<IapProduct[]> {
    return DEFAULT_PLANS;
  }
  async purchasePlan(planCode: string): Promise<PurchaseResult> {
    return {
      success: false,
      planCode,
      purchaseToken: null,
      expiresAt: null,
      errorMessage: 'Premium purchases are not available yet — check back soon.',
    };
  }
  async restorePurchases(): Promise<PurchaseResult[]> {
    return [];
  }
  async verifyReceipt(purchaseToken: string, planCode?: string): Promise<PurchaseResult> {
    return {
      success: false,
      planCode: planCode ?? '',
      purchaseToken,
      expiresAt: null,
      errorMessage: 'No receipt verifier configured.',
    };
  }
}

/**
 * Google Play Billing via react-native-iap (event-driven: results arrive through
 * purchaseUpdatedListener / purchaseErrorListener, not from requestPurchase). Purchases are
 * verified server-side (verify-play-receipt) before Premium switches on. Needs, outside this code:
 * the `cloudlynk_premium` product with one base plan per DEFAULT_PLANS entry in Play Console, the
 * verifier's service account, and IAP_PROVIDER=google_play.
 */
export class GooglePlayIapService implements IIapService {
  async getProducts(): Promise<IapProduct[]> {
    return DEFAULT_PLANS;
  }

  /**
   * Wraps the event-driven purchase in a promise: starts it with dispatch(), resolves on the
   * matching purchase, rejects on a purchase error or if dispatch throws, and times out after 5
   * minutes. Both listeners are removed when it settles.
   */
  private awaitPurchaseResult(
    RNIap: RNIapModule,
    productId: string,
    dispatch: () => Promise<unknown>,
    userChoice = false,
  ): Promise<PurchaseOutcome> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        updateSub.remove();
        errorSub.remove();
        choiceSub?.remove();
      };

      const timeout = setTimeout(
        () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('Purchase timed out.'));
        },
        5 * 60 * 1000,
      );

      const updateSub = RNIap.purchaseUpdatedListener(purchase => {
        if (settled || purchase.productId !== productId) return;
        settled = true;
        cleanup();
        resolve({ kind: 'purchase', purchase });
      });
      // User choice billing: if the person picks the app's own payment
      // option on Google's screen, no purchase happens here -- Google hands
      // over a token instead, and the caller opens our payment methods.
      const choiceSub =
        userChoice && typeof RNIap.userChoiceBillingListenerAndroid === 'function'
          ? RNIap.userChoiceBillingListenerAndroid(details => {
              if (settled || !details.externalTransactionToken) return;
              settled = true;
              cleanup();
              resolve({ kind: 'alternative', token: details.externalTransactionToken });
            })
          : null;
      const errorSub = RNIap.purchaseErrorListener((error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(errorMessage(error, 'Purchase failed or was cancelled.')));
      });

      dispatch().catch(err => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  async purchasePlan(
    planCode: string,
    opts?: { userChoiceBilling?: boolean },
  ): Promise<PurchaseResult> {
    if (Platform.OS !== 'android') {
      return {
        success: false,
        planCode,
        purchaseToken: null,
        expiresAt: null,
        errorMessage: 'Google Play Billing is Android-only.',
      };
    }
    const plan = DEFAULT_PLANS.find(p => p.code === planCode);
    const productId = plan?.iapProductId;
    if (!plan || !productId) {
      return {
        success: false,
        planCode,
        purchaseToken: null,
        expiresAt: null,
        errorMessage: `No Play product configured for plan "${planCode}".`,
      };
    }
    try {
      const RNIap = loadIap();
      const userChoice = !!opts?.userChoiceBilling;
      // With user choice billing on, Google shows its choice screen before
      // the purchase. If the account is not enrolled in the program, or the
      // user is outside India, Play simply runs the normal purchase.
      await RNIap.initConnection(
        userChoice ? { alternativeBillingModeAndroid: 'user-choice' } : undefined,
      );
      try {
        const products = await RNIap.fetchProducts({ skus: [productId], type: 'subs' });
        const product = Array.isArray(products) ? products[0] : null;
        const offers =
          product && 'subscriptionOfferDetailsAndroid' in product
            ? product.subscriptionOfferDetailsAndroid
            : null;
        // All 4 plans share one product, so pick the offer whose base plan
        // matches this plan — index 0 would silently buy whichever base plan
        // Play happened to list first.
        const offerToken = offers?.find(o => o.basePlanId === plan.basePlanId)?.offerToken;
        if (!offerToken) {
          return {
            success: false,
            planCode,
            purchaseToken: null,
            expiresAt: null,
            errorMessage: `The "${plan.basePlanId}" base plan isn't live in Play Console yet.`,
          };
        }

        const outcome = await this.awaitPurchaseResult(
          RNIap,
          productId,
          () =>
            RNIap.requestPurchase({
              request: {
                google: {
                  skus: [productId],
                  subscriptionOffers: [{ sku: productId, offerToken }],
                },
              },
              type: 'subs',
            }),
          userChoice,
        );

        if (outcome.kind === 'alternative') {
          return {
            success: false,
            planCode,
            purchaseToken: null,
            expiresAt: null,
            alternativeBillingToken: outcome.token,
          };
        }

        const { purchase } = outcome;
        const purchaseToken = purchase.purchaseToken ?? null;
        if (!purchaseToken) {
          return {
            success: false,
            planCode,
            purchaseToken: null,
            expiresAt: null,
            errorMessage: 'Purchase completed but no token was returned.',
          };
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
            console.error(
              'IAP: finishTransaction failed after successful verification:',
              finishErr,
            );
          }
        }
        return verified;
      } finally {
        await RNIap.endConnection();
      }
    } catch (err) {
      return {
        success: false,
        planCode,
        purchaseToken: null,
        expiresAt: null,
        errorMessage: errorMessage(err, 'Google Play purchase failed.'),
      };
    }
  }

  async restorePurchases(): Promise<PurchaseResult[]> {
    if (Platform.OS !== 'android') return [];
    try {
      const RNIap = loadIap();
      await RNIap.initConnection();
      try {
        const purchases = await RNIap.getAvailablePurchases();
        const results: PurchaseResult[] = [];
        for (const purchase of purchases) {
          const token = purchase.purchaseToken ?? null;
          // All 4 plans share one product id, so the product id can't tell
          // us which plan this is — don't resolve it client-side. Pass the
          // base plan id react-native-iap reports as currentPlanId (advisory
          // only) and let verify-play-receipt derive the authoritative plan.
          if (token && purchase.productId === PREMIUM_PRODUCT_ID) {
            const verified = await this.verifyReceipt(token, purchase.currentPlanId ?? undefined);
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
      return {
        success: false,
        planCode: claimed,
        purchaseToken,
        expiresAt: null,
        errorMessage:
          'RECEIPT_VERIFIER_URL is not configured — set up the server-side Play receipt verifier before going live.',
      };
    }
    try {
      // The verifier grants Premium to the signed-in caller, so it needs the
      // session. This call used to send no Authorization header at all, and
      // the function answered every real purchase with 401 -- money taken,
      // nothing granted.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        return {
          success: false,
          planCode: claimed,
          purchaseToken,
          expiresAt: null,
          errorMessage: 'Please sign in again, then use "Restore purchase".',
        };
      }
      const res = await fetch(config.receiptVerifierUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        // `planCode` is advisory — the server derives the real plan from
        // Google's record of the token and returns it as `json.planCode`.
        body: JSON.stringify({
          purchaseToken,
          planCode,
          packageName: config.googlePlayPackageName,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.valid) {
        return {
          success: false,
          planCode: claimed,
          purchaseToken,
          expiresAt: null,
          errorMessage: json?.error ?? 'Receipt verification failed.',
        };
      }
      return {
        success: true,
        planCode: json.planCode ?? claimed,
        purchaseToken,
        expiresAt: json.expiresAt ?? null,
      };
    } catch (err) {
      return {
        success: false,
        planCode: claimed,
        purchaseToken,
        expiresAt: null,
        errorMessage: errorMessage(err, 'Could not reach the receipt verifier.'),
      };
    }
  }
}

export function getIapService(): IIapService {
  if (isIapLive()) return new GooglePlayIapService();
  return new NoOpIapService();
}
