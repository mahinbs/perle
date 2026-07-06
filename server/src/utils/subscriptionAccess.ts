/**
 * Single source of truth for whether a user_profile row grants paid access.
 * Razorpay: requires razorpay_payment_id (set only after successful checkout).
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
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
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
  if (typeof id === 'string' && id.startsWith('manual_')) {
    return true;
  }
  // SQL admin grants without subscription_id still count as manual
  const tier = profile.premium_tier;
  const paidTier = tier === 'pro' || tier === 'max';
  return (
    paidTier &&
    profile.is_premium === true &&
    profile.subscription_status === 'active' &&
    !profile.razorpay_subscription_id &&
    !profile.razorpay_payment_id &&
    !profile.stripe_subscription_id &&
    !profile.stripe_customer_id
  );
}

/** Manual SQL grants — never auto-revoke; ignore stray Razorpay checkout fields. */
function evaluateManualGrantAccess(profile: SubscriptionProfile): SubscriptionAccess | null {
  if (!isManualAdminGrant(profile)) return null;

  const endRaw = profile.subscription_end_date;
  if (endRaw) {
    const endDate = new Date(endRaw);
    if (!Number.isNaN(endDate.getTime()) && endDate < new Date()) {
      return {
        isPremium: false,
        premiumTier: 'free',
        subscriptionStatus: 'expired',
        shouldRevokeInDb: false,
      };
    }
  }

  let tier = profile.premium_tier || 'free';
  if (tier !== 'pro' && tier !== 'max') {
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

function usesStripeBilling(profile: SubscriptionProfile): boolean {
  return Boolean(profile.stripe_subscription_id || profile.stripe_customer_id);
}

export function isUnpaidRazorpayProfile(profile: SubscriptionProfile): boolean {
  return usesRazorpayBilling(profile) && !profile.razorpay_payment_id;
}

export function evaluateSubscriptionAccess(
  profile: SubscriptionProfile | null | undefined
): SubscriptionAccess {
  const p = profile || {};

  const manualAccess = evaluateManualGrantAccess(p);
  if (manualAccess) return manualAccess;

  let premiumTier = p.premium_tier || 'free';
  const subscriptionStatus = p.subscription_status || 'inactive';
  let shouldRevokeInDb = false;

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

  if (subscriptionStatus === 'active') {
    const hasPaidProvider =
      (usesRazorpayBilling(p) && Boolean(p.razorpay_payment_id)) ||
      usesStripeBilling(p) ||
      (Boolean(p.subscription_id) && !usesRazorpayBilling(p) && !usesStripeBilling(p));

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

  // Never auto-revoke manual admin SQL grants on background verify/search.
  if (profile && isManualAdminGrant(profile)) {
    return;
  }

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
  'premium_tier, is_premium, subscription_status, subscription_end_date, razorpay_subscription_id, razorpay_payment_id, razorpay_plan_id, stripe_subscription_id, stripe_customer_id, subscription_id';

export async function getSubscriptionAccessForUser(
  userId: string
): Promise<SubscriptionAccess> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select(SUBSCRIPTION_PROFILE_SELECT)
    .eq('user_id', userId)
    .single();

  const access = evaluateSubscriptionAccess(profile as SubscriptionProfile | null);
  await persistSubscriptionAccessFix(userId, access, profile as SubscriptionProfile | null);
  await persistManualGrantSnapshot(userId, (profile || {}) as SubscriptionProfile, access);
  return access;
}
