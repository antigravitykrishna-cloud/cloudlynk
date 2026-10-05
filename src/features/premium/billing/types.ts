export interface IapProduct {
  code: string;
  name: string;
  description: string;
  durationDays: number;
  priceInr: number;
  iapProductId: string | null;
  /**
   * Play Console base plan id. All Cloudlynk plans share one subscription
   * product (`cloudlynk_premium`) and are distinguished by base plan, not
   * product id — this is what selects the right purchasable offer.
   */
  basePlanId: string;
  isPopular: boolean;
  sortOrder: number;
}

export interface PurchaseResult {
  success: boolean;
  planCode: string;
  purchaseToken: string | null;
  expiresAt: string | null;
  errorMessage?: string;
  /**
   * Set when the person chose the app's own payment option on Google's choice screen. Nothing is
   * bought yet; the token goes with the gateway order so the server can report the sale to Google.
   */
  alternativeBillingToken?: string;
}

export interface IIapService {
  getProducts(): Promise<IapProduct[]>;
  purchasePlan(planCode: string, opts?: { userChoiceBilling?: boolean }): Promise<PurchaseResult>;
  restorePurchases(): Promise<PurchaseResult[]>;
  // `planCode` is advisory only — the server derives the authoritative plan
  // from Google's own record of the purchase token (see verify-play-receipt).
  verifyReceipt(purchaseToken: string, planCode?: string): Promise<PurchaseResult>;
}
