// verify-play-receipt -- confirms a Google Play purchase with Google before granting Premium.
//
// Play's Payments policy requires purchases to be verified on a server, not trusted from the app.
// The app (premium/billing/googlePlayBilling.ts) sends the raw purchase token; this function asks
// the Play Developer API about it with a service account the app never sees, acknowledges it
// (Google refunds anything unacknowledged after 3 days), records it in iap_purchases (so
// play-rtdn-webhook can find the account on renewal or refund), and only then grants the plan.
//
// Trust boundary: every plan is a base plan of ONE Play product, so the token must be for that
// product, and the plan granted is the base plan GOOGLE reports -- never the one the app claims.
//
// One purchase, one account: the first account to verify a token owns it. The one exception is a
// purchase made on a guest ID, which moves to the caller (a guest cannot sign back in, so the
// plan would otherwise be stranded) and is revoked from the guest.
//
// Secrets: GOOGLE_SERVICE_ACCOUNT_JSON (see _shared/play-billing.ts).
// Request:  POST { purchaseToken, packageName, planCode? }   (signed in; planCode is advisory)
// Response: { valid: true, planCode, expiresAt } or { valid: false, error }

import { HttpError, readJson, servePost, stringField } from '../_shared/http.ts';
import {
  acknowledgeSubscription,
  getSubscriptionStatus,
  planStatusFor,
  type PlaySubscriptionStatus,
} from '../_shared/play-billing.ts';
import { adminClient, requireCaller, type SupabaseClient } from '../_shared/supabase.ts';

const PREMIUM_PRODUCT_ID = 'cloudlynk_premium';

// Google's base plan id -> our plan code (subscription_plans.code). Kept as an explicit map so
// renaming one side can never silently grant the wrong plan.
const PLAN_CODE_BY_BASE_PLAN: Record<string, string> = {
  'trial-3d': 'trial',
  'silver-7d': 'silver-7d',
  'gold-1m': 'gold-1m',
  'platinum-6m': 'platinum-6m',
  'diamond-1y': 'diamond-1y',
};

servePost(
  'verify-play-receipt',
  async (req, respond) => {
    const { user } = await requireCaller(req);
    const body = await readJson(req);
    const purchaseToken = stringField(body, 'purchaseToken');
    const packageName = stringField(body, 'packageName');
    const claimedPlanCode = stringField(body, 'planCode');
    if (!purchaseToken || !packageName) {
      return respond({ valid: false, error: 'Missing purchaseToken or packageName.' }, 400);
    }

    const status = await fetchStatus(packageName, purchaseToken);
    if (!status.valid) {
      return respond({ valid: false, error: 'Purchase is not active according to Google Play.' });
    }

    const productId = productIdOf(status.raw);
    if (productId !== PREMIUM_PRODUCT_ID) {
      console.error(`verify-play-receipt: token is for "${productId}", not ${PREMIUM_PRODUCT_ID}`);
      throw new HttpError(400, "Purchase does not match this app's subscription product.");
    }
    const planCode = status.basePlanId ? PLAN_CODE_BY_BASE_PLAN[status.basePlanId] : undefined;
    if (!planCode) {
      console.error(`verify-play-receipt: unmapped base plan "${status.basePlanId}"`);
      throw new HttpError(
        400,
        "This purchase's plan could not be identified. If you just subscribed, try again shortly.",
      );
    }
    if (claimedPlanCode && claimedPlanCode !== planCode) {
      // Not fatal: grant what was actually paid for (a stale screen, or a modified app).
      console.warn(
        `verify-play-receipt: app claimed "${claimedPlanCode}", Google says "${planCode}"`,
      );
    }

    const db = adminClient();
    await claimPurchase(db, purchaseToken, user.id);

    const acknowledged =
      status.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' ||
      (await acknowledgeSubscription(packageName, productId, purchaseToken));

    const { planStatus, expiresAtIso } = planStatusFor(status);
    const { error: recordError } = await db.from('iap_purchases').upsert(
      {
        user_id: user.id,
        purchase_token: purchaseToken,
        product_id: productId,
        plan_code: planCode,
        base_plan_id: status.basePlanId,
        package_name: packageName,
        platform: 'android',
        status: planStatus,
        expires_at: expiresAtIso,
        acknowledged,
        last_notification_type: 'INITIAL_PURCHASE',
        raw_response: status.raw,
      },
      { onConflict: 'purchase_token' },
    );
    if (recordError)
      console.error('verify-play-receipt: recording purchase failed:', recordError.message);

    // Through apply_play_entitlement, never a direct UPDATE: protect_profile_privileged_fields
    // silently reverts plan_status written any other way. If this fails, money has changed hands
    // and nothing was granted, so it is a hard error the app retries (this call is idempotent).
    const { error: grantError } = await db.rpc('apply_play_entitlement', {
      p_user_id: user.id,
      p_plan_status: planStatus,
      p_expires_at: expiresAtIso,
    });
    if (grantError) {
      console.error('verify-play-receipt: apply_play_entitlement failed:', grantError.message);
      throw new HttpError(
        500,
        'Your purchase went through, but we could not activate it. Reopen the app to retry — you will not be charged twice.',
      );
    }

    return respond({ valid: true, planCode, expiresAt: expiresAtIso });
  },
  { fallbackError: 'Verification failed.' },
);

async function fetchStatus(packageName: string, token: string): Promise<PlaySubscriptionStatus> {
  try {
    return await getSubscriptionStatus(packageName, token);
  } catch (err) {
    if (err instanceof Error && err.message === 'MISSING_SERVICE_ACCOUNT') {
      throw new HttpError(
        500,
        'Receipt verifier is not configured (GOOGLE_SERVICE_ACCOUNT_JSON missing).',
      );
    }
    throw err;
  }
}

/** The product a subscription status is for, from Google's own record. */
function productIdOf(raw: unknown): string | null {
  const lineItems = (raw as { lineItems?: { productId?: unknown }[] } | null)?.lineItems;
  const productId = Array.isArray(lineItems) ? lineItems[0]?.productId : undefined;
  return typeof productId === 'string' ? productId : null;
}

/**
 * Makes sure the token belongs to `userId`. A token owned by another saved account is refused;
 * one owned by a guest ID moves here, and the guest's plan is revoked.
 */
async function claimPurchase(db: SupabaseClient, token: string, userId: string): Promise<void> {
  const { data: existing } = await db
    .from('iap_purchases')
    .select('user_id')
    .eq('purchase_token', token)
    .maybeSingle();
  if (!existing?.user_id || existing.user_id === userId) return;

  const { data: owner } = await db
    .from('profiles')
    .select('is_guest')
    .eq('id', existing.user_id)
    .maybeSingle();
  if (!owner?.is_guest) {
    console.warn(`verify-play-receipt: token belongs to another account (caller ${userId})`);
    throw new HttpError(
      409,
      'This purchase is linked to a different Cloudlynk account. Sign in with the account you bought it on.',
    );
  }

  console.log(`verify-play-receipt: moving purchase from guest ${existing.user_id} to ${userId}`);
  const { error } = await db.rpc('apply_play_entitlement', {
    p_user_id: existing.user_id,
    p_plan_status: 'free',
    p_expires_at: null,
  });
  if (error) {
    console.error('verify-play-receipt: revoking the guest failed:', error.message);
    throw new HttpError(500, 'Could not move this purchase. Please try again.');
  }
}
