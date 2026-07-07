/**
 * Single source of truth for whether a user_profile row grants paid access.
 * Razorpay: requires razorpay_payment_id (set only after successful checkout).
 *
 * Manual admin grants (set via SQL) are detected by:
 *  1. subscription_id starting with 'manual_' (e.g. 'manual_admin_grant')
 *  2. OR: is_premium=true + active status + paid tier + no payment provider IDs
 *
 * IMPORTANT: Never auto-revoke a manual admin grant. The DB write order is:
 *   persistManualGrantSnapshot FIRST → then persistSubscriptionAccessFix
 * so the grant is always re-asserted before any potential downgrade write.
 */

import { supabase } from '../lib/supabase.js';

export type SubscriptionProfile = {
  premium_tier?: string | null;
  is_premium?: boolean | null;
  subscription_status?: string | null;
  subscription_end_date?: string | null;
  auto_renew?: boolean | null;
  razorpay_subscription_id?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_plan_id?: string | null;
  subscription_id?: string | null;
  free_search_used?: number | null;
  free_deep_used?: number | null;
};

export type SubscriptionAccess = {
  isPremium: boolean;
  premiumTier: string;
  subscriptionStatus: string;
  shouldRevokeInDb: boolean;
};

export function isManualAdminGrant(profile: SubscriptionProfile): boolean {
  const id = profile.subscription_id;

  // 1) Explicit manual/admin keywords in subscription_id (case-insensitive)
  if (typeof id === 'string') {
    const lowerId = id.toLowerCase();
    if (
      lowerId.startsWith('manual') ||
      lowerId.startsWith('admin') ||
      lowerId.startsWith('sql') ||
      lowerId.startsWith('override') ||
      lowerId.startsWith('gift') ||
      lowerId.startsWith('promo') ||
      lowerId === 'system' ||
      lowerId === 'free_pass'
    ) {
      return true;
    }
  }

  // 2) Heuristic: user profile has:
  //  - premium_tier is 'pro' or 'max'
  //  - is_premium is true
  //  - subscription_status is 'active'
  //  - subscription_end_date is NULL or in the future
  //  - and NO active automated subscription ID format (e.g. not starting with 'sub_')
  const tier = profile.premium_tier;
  const paidTier = tier === 'pro' || tier === 'max';
  if (paidTier && profile.is_premium === true && profile.subscription_status === 'active') {
    // If the subscription ID is a Stripe/Razorpay sub ID format (e.g. starts with 'sub_'),
    // we do not treat it as a manual grant.
    if (typeof id === 'string' && id.toLowerCase().startsWith('sub_')) {
      return false;
    }

    // If there is an end date and it is in the past, it's expired
    const endRaw = profile.subscription_end_date;
    if (endRaw) {
      const endDate = new Date(endRaw);
      if (!Number.isNaN(endDate.getTime()) && endDate < new Date()) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/** Manual SQL grants — never auto-revoke; ignore stray Razorpay checkout fields. */
function evaluateManualGrantAccess(profile: SubscriptionProfile): SubscriptionAccess | null {
  if (!isManualAdminGrant(profile)) return null;

  // If there's an explicit end date and it's past, the grant is expired.
  const endRaw = profile.subscription_end_date;
  if (endRaw) {
    const endDate = new Date(endRaw);
    if (!Number.isNaN(endDate.getTime()) && endDate < new Date()) {
      return {
        isPremium: false,
        premiumTier: 'free',
        subscriptionStatus: 'expired',
        shouldRevokeInDb: false, // Never revoke manual grants in DB; admin must do it manually
      };
    }
  }
  // No end date = indefinite admin grant → always active

  let tier = profile.premium_tier || 'free';
  if (tier !== 'pro' && tier !== 'max') {
    // If tier is somehow not pro/max but is_premium is true, default to 'max'
    if (profile.is_premium === true) {
      tier = 'max';
    } else {
      return {
        isPremium: false,
        premiumTier: 'free',
        subscriptionStatus: profile.subscription_status || 'inactive',
        shouldRevokeInDb: false,
      };
    }
  }

  return {
    isPremium: true,
    premiumTier: tier,
    subscriptionStatus: 'active',
    shouldRevokeInDb: false,
  };
}

function usesRazorpayBilling(profile: SubscriptionProfile): boolean {
  return Boolean(
    profile.razorpay_subscription_id ||
    profile.razorpay_payment_id ||
    profile.razorpay_plan_id
  );
}

export function isUnpaidRazorpayProfile(profile: SubscriptionProfile): boolean {
  return usesRazorpayBilling(profile) && !profile.razorpay_payment_id;
}

export function evaluateSubscriptionAccess(
  profile: SubscriptionProfile | null | undefined
): SubscriptionAccess {
  const p = profile || {};

  // ── Manual admin grant check (highest priority — never revoke) ────────────
  const manualAccess = evaluateManualGrantAccess(p);
  if (manualAccess) return manualAccess;

  let premiumTier = p.premium_tier || 'free';
  const subscriptionStatus = p.subscription_status || 'inactive';
  let shouldRevokeInDb = false;

  // ── Razorpay initiated checkout but no payment captured yet ───────────────
  if (!isManualAdminGrant(p) && isUnpaidRazorpayProfile(p)) {
    if (premiumTier !== 'free' || subscriptionStatus === 'active' || p.is_premium === true) {
      shouldRevokeInDb = true;
    }
    return {
      isPremium: false,
      premiumTier: 'free',
      subscriptionStatus: 'inactive',
      shouldRevokeInDb,
    };
  }

  const subscriptionEndDate = p.subscription_end_date;

  if (subscriptionEndDate) {
    const endDate = new Date(subscriptionEndDate);
    const now = new Date();

    if (endDate < now) {
      if (
        subscriptionStatus === 'active' ||
        subscriptionStatus === 'cancelled' ||
        subscriptionStatus === 'paused'
      ) {
        return {
          isPremium: false,
          premiumTier: 'free',
          subscriptionStatus: 'expired',
          shouldRevokeInDb: true,
        };
      }
      return {
        isPremium: false,
        premiumTier: 'free',
        subscriptionStatus,
        shouldRevokeInDb: false,
      };
    }

    if (
      subscriptionStatus === 'active' ||
      subscriptionStatus === 'cancelled' ||
      subscriptionStatus === 'paused'
    ) {
      const isPremium = premiumTier === 'pro' || premiumTier === 'max';
      return {
        isPremium,
        premiumTier: isPremium ? premiumTier : 'free',
        subscriptionStatus,
        shouldRevokeInDb: false,
      };
    }

    if (premiumTier !== 'free') {
      shouldRevokeInDb = true;
    }
    return {
      isPremium: false,
      premiumTier: 'free',
      subscriptionStatus,
      shouldRevokeInDb,
    };
  }

  // No end date — requires a confirmed payment provider to grant premium
  if (subscriptionStatus === 'active') {
    const hasPaidProvider =
      (usesRazorpayBilling(p) && Boolean(p.razorpay_payment_id)) ||
      (Boolean(p.subscription_id) && !usesRazorpayBilling(p));

    if (hasPaidProvider && (premiumTier === 'pro' || premiumTier === 'max')) {
      return {
        isPremium: true,
        premiumTier,
        subscriptionStatus,
        shouldRevokeInDb: false,
      };
    }

    if (premiumTier !== 'free' || p.is_premium) {
      shouldRevokeInDb = true;
    }
    return {
      isPremium: false,
      premiumTier: 'free',
      subscriptionStatus: 'inactive',
      shouldRevokeInDb,
    };
  }

  const needsCleanup = premiumTier !== 'free' || p.is_premium === true;
  return {
    isPremium: false,
    premiumTier: needsCleanup ? 'free' : premiumTier,
    subscriptionStatus,
    shouldRevokeInDb: needsCleanup,
  };
}

export async function persistSubscriptionAccessFix(
  userId: string,
  access: SubscriptionAccess,
  profile?: SubscriptionProfile | null
): Promise<void> {
  if (!access.shouldRevokeInDb) return;

  // CRITICAL GUARD: Never auto-revoke manual admin SQL grants.
  // This is checked in evaluateSubscriptionAccess too, but double-safety here
  // ensures a coding mistake upstream can never silently downgrade an admin grant.
  if (profile && isManualAdminGrant(profile)) {
    console.warn('⚠️  subscriptionAccess: attempted to revoke a manual admin grant — blocked.');
    return;
  }

  console.log(`🔧 subscriptionAccess: revoking stale premium for user ${userId}`);
  await supabase
    .from('user_profiles')
    .update({
      premium_tier: access.premiumTier,
      is_premium: access.isPremium,
      subscription_status: access.subscriptionStatus,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('user_id', userId);
}

/** Keep manual grant rows consistent after login / verify (repair counters, re-assert tier). */
export async function persistManualGrantSnapshot(
  userId: string,
  profile: SubscriptionProfile,
  access: SubscriptionAccess
): Promise<void> {
  if (!isManualAdminGrant(profile) || !access.isPremium) return;

  console.log(`✅ subscriptionAccess: re-asserting manual admin grant for user ${userId} (tier=${access.premiumTier})`);
  await supabase
    .from('user_profiles')
    .update({
      premium_tier: access.premiumTier,
      is_premium: true,
      subscription_status: 'active',
      free_search_used: 0,
      free_deep_used: 0,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('user_id', userId);
}

const SUBSCRIPTION_PROFILE_SELECT =
  'premium_tier, is_premium, subscription_status, subscription_end_date, razorpay_subscription_id, razorpay_payment_id, razorpay_plan_id, subscription_id';

export async function getSubscriptionAccessForUser(
  userId: string
): Promise<SubscriptionAccess> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select(SUBSCRIPTION_PROFILE_SELECT)
    .eq('user_id', userId)
    .single();

  const access = evaluateSubscriptionAccess(profile as SubscriptionProfile | null);

  // ── IMPORTANT: snapshot FIRST, revoke check SECOND ───────────────────────
  // persistManualGrantSnapshot re-asserts premium in DB for admin grants.
  // persistSubscriptionAccessFix may downgrade stale rows.
  // Running snapshot first ensures a manual grant is never accidentally wiped
  // by the revoke pass on the same request cycle.
  await persistManualGrantSnapshot(userId, (profile || {}) as SubscriptionProfile, access);
  await persistSubscriptionAccessFix(userId, access, profile as SubscriptionProfile | null);

  return access;
}
