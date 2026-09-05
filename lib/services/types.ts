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
}

export interface IIapService {
  getProducts(): Promise<IapProduct[]>;
  purchasePlan(planCode: string): Promise<PurchaseResult>;
  restorePurchases(): Promise<PurchaseResult[]>;
  // `planCode` is advisory only — the server derives the authoritative plan
  // from Google's own record of the purchase token (see verify-play-receipt).
  verifyReceipt(purchaseToken: string, planCode?: string): Promise<PurchaseResult>;
}

export interface IAnalyticsService {
  logEvent(name: string, properties?: Record<string, unknown>): void;
  setUserId(userId: string): void;
  logError(error: Error, context?: Record<string, unknown>): void;
}

export interface IAdsService {
  showBanner(): Promise<void>;
  hideBanner(): Promise<void>;
  showInterstitial(): Promise<void>;
}

export interface IErrorService {
  captureError(error: Error, context?: Record<string, unknown>): void;
  captureMessage(message: string, context?: Record<string, unknown>): void;
}

export interface IPushService {
  requestPermission(): Promise<boolean>;
  getToken(): Promise<string | null>;
  onMessage(handler: (message: { title: string; body: string; data?: Record<string, unknown> }) => void): () => void;
}
