import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import {
  getRazorpayCredentials,
  getRazorpayPlanIds,
} from '../utils/razorpayConfig.js';
import { resolveRazorpayPlanKey } from '../utils/razorpayPlans.js';
import {
  evaluateSubscriptionAccess,
  persistSubscriptionAccessFix,
  persistManualGrantSnapshot,
  isManualAdminGrant,
  type SubscriptionProfile,
} from '../utils/subscriptionAccess.js';
import { getFrontendOrigin } from '../lib/supabaseOAuth.js';

const router = Router();

function getAllowedFrontendOrigins(): string[] {
  return [process.env.CORS_ORIGIN, process.env.CORS_ORIGINS, process.env.FRONTEND_URL]
    .filter(Boolean)
    .flatMap((value) => (value as string).split(','))
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** Prevent open redirects: only allow CORS-listed origins (plus default frontend). */
function resolveCheckoutReturnOrigin(req: Request): string {
  const candidates = [
    typeof req.query.return_to === 'string' ? req.query.return_to : null,
    typeof (req.body as { return_to?: string } | undefined)?.return_to === 'string'
      ? (req.body as { return_to: string }).return_to
      : null,
  ].filter(Boolean) as string[];

  const allowed = new Set(getAllowedFrontendOrigins());
  allowed.add(getFrontendOrigin());

  for (const raw of candidates) {
    try {
      const origin = new URL(raw).origin;
      if (allowed.has(origin)) return origin;
    } catch {
      // ignore invalid return_to
    }
  }
  return getFrontendOrigin();
}

function pickCallbackField(
  sources: Array<Record<string, unknown>>,
  key: string
): string | null {
  for (const src of sources) {
    const value = src[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Razorpay callback_url always POSTs payment fields.
 * Static hosts (Vercel SPA) reject POST → HTTP 405.
 * Accept POST/GET here and 303-redirect to the SPA as a GET with query params.
 * Docs: https://razorpay.com/docs/payments/payment-gateway/callback-url/
 */
function handleRazorpayCheckoutCallback(req: Request, res: Response) {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const query = (req.query && typeof req.query === 'object' ? req.query : {}) as Record<string, unknown>;
  const sources = [body, query];

  const params = new URLSearchParams();
  for (const key of [
    'razorpay_payment_id',
    'razorpay_subscription_id',
    'razorpay_order_id',
    'razorpay_signature',
    'error',
    'error[code]',
    'error[description]',
  ]) {
    const value = pickCallbackField(sources, key);
    if (value) params.set(key, value);
  }

  const frontend = resolveCheckoutReturnOrigin(req);
  // /payment/complete avoids Vercel rewrite of /payment/callback → serverless loop
  const target = `${frontend}/payment/complete${params.toString() ? `?${params.toString()}` : ''}`;
  console.log(`Razorpay checkout callback ${req.method} → 303 ${target}`);
  return res.redirect(303, target);
}

router.post('/payment/callback', handleRazorpayCheckoutCallback);
router.get('/payment/callback', handleRazorpayCheckoutCallback);

/**
 * Razorpay subscription checkout signature:
 *   hmac_sha256(razorpay_payment_id + "|" + razorpay_subscription_id, key_secret)
 * Docs: https://razorpay.com/docs/payments/subscriptions/integration-guide/
 * (Order payments use order_id|payment_id — do not confuse the two.)
 */
function verifySubscriptionCheckoutSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  secret: string
): boolean {
  if (!paymentId || !subscriptionId || !signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    return expected === signature;
  }
}

function getRazorpayInstance() {
  const { keyId, keySecret } = getRazorpayCredentials();

  if (!keyId || !keySecret) {
    throw new Error(
      'Razorpay API keys are not configured. Set production (RAZORPAY_KEY_ID/SECRET) or test (RAZORPAY_TEST_KEY_ID/SECRET) credentials in .env.'
    );
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

function getPlans() {
  const planIds = getRazorpayPlanIds();
  return {
    pro: {
      name: 'IQ Pro',
      amount: 39900,
      currency: 'INR',
      description: 'Perfect for creators and strategists',
      tier: 'pro' as const,
      planId: planIds.pro,
    },
    max: {
      name: 'IQ Max',
      amount: 89900,
      currency: 'INR',
      description: 'Built for teams running mission-critical workflows',
      tier: 'max' as const,
      planId: planIds.max,
    },
  };
}

// Helper to determine plan hierarchy
function getPlanLevel(tier: string): number {
  if (tier === 'max') return 2;
  if (tier === 'pro') return 1;
  return 0; // free
}

/** Paid period still valid (active, cancelled-at-period-end, or paused). */
function hasValidPaidPeriod(profile: Record<string, unknown> | null | undefined): boolean {
  if (!profile?.razorpay_payment_id) return false;
  const endRaw = profile.subscription_end_date as string | null | undefined;
  if (!endRaw) return false;
  const endDate = new Date(endRaw);
  if (Number.isNaN(endDate.getTime()) || endDate <= new Date()) return false;
  const status = (profile.subscription_status as string) || 'inactive';
  return status === 'active' || status === 'cancelled' || status === 'paused';
}

function resolvePlanOrThrow(
  opts: Parameters<typeof resolveRazorpayPlanKey>[0]
): 'pro' | 'max' {
  const plan = resolveRazorpayPlanKey(opts);
  if (!plan) {
    throw new Error(
      'Could not resolve subscription plan (Pro/Max). Check Razorpay plan IDs and subscription notes.'
    );
  }
  return plan;
}

/** Activate Pro/Max on the user profile after a confirmed Razorpay charge. */
async function activatePremiumForUser(opts: {
  userId: string;
  plan: 'pro' | 'max';
  paymentId: string;
  startDate: Date;
  endDate: Date;
  autoRenew?: boolean;
}): Promise<void> {
  const planConfig = getPlans()[opts.plan];
  const { error } = await supabase
    .from('user_profiles')
    .update({
      premium_tier: planConfig.tier,
      is_premium: true,
      razorpay_payment_id: opts.paymentId,
      subscription_id: `sub_${opts.userId}_${Date.now()}`,
      subscription_start_date: opts.startDate.toISOString(),
      subscription_end_date: opts.endDate.toISOString(),
      subscription_status: 'active',
      ...(opts.autoRenew !== undefined ? { auto_renew: opts.autoRenew } : {}),
      updated_at: new Date().toISOString(),
    } as any)
    .eq('user_id', opts.userId);

  if (error) {
    throw new Error(`Failed to activate subscription: ${error.message}`);
  }
}

/**
 * If checkout succeeded in Razorpay but client verify never ran (e.g. Android
 * killed after UPI), pull status from Razorpay and activate Pro/Max.
 */
async function syncPendingRazorpaySubscription(
  userId: string,
  profile: SubscriptionProfile
): Promise<SubscriptionProfile | null> {
  const subscriptionId = profile.razorpay_subscription_id;
  if (!subscriptionId || profile.razorpay_payment_id) {
    return null;
  }

  const razorpay = getRazorpayInstance();
  const subscription = (await razorpay.subscriptions.fetch(subscriptionId)) as any;
  const validStatuses = ['active', 'authenticated'];
  if (!validStatuses.includes(subscription.status)) {
    return null;
  }

  const PLANS = getPlans();
  const plan = resolvePlanOrThrow({
    planIds: { pro: PLANS.pro.planId, max: PLANS.max.planId },
    storedPlanId: profile.razorpay_plan_id,
    razorpayPlanId: subscription.plan_id,
    notes: subscription.notes || {},
  });

  let paymentId: string | null = null;
  try {
    const invoices = (await (razorpay as any).invoices.all({
      subscription_id: subscriptionId,
      count: 5,
    })) as { items?: Array<{ payment_id?: string; status?: string }> };
    const paid = (invoices.items || []).find(
      (inv) => inv.payment_id && (inv.status === 'paid' || inv.status === 'partially_paid')
    );
    paymentId = paid?.payment_id || null;
  } catch (err) {
    console.warn('Could not list invoices for subscription sync:', err);
  }

  if (!paymentId) {
    // Confirmed active at Razorpay — mark paid so access gating unlocks.
    paymentId = `rzp_confirmed_${subscriptionId}`;
  }

  const startDate = new Date((subscription.current_start || subscription.created_at) * 1000);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  await activatePremiumForUser({
    userId,
    plan,
    paymentId,
    startDate,
    endDate,
    autoRenew: profile.auto_renew ?? true,
  });

  console.log(
    `Synced Razorpay subscription ${subscriptionId} → ${plan} for user ${userId}`
  );

  return {
    ...profile,
    premium_tier: plan,
    is_premium: true,
    razorpay_payment_id: paymentId,
    subscription_status: 'active',
    subscription_start_date: startDate.toISOString(),
    subscription_end_date: endDate.toISOString(),
  };
}

// Create subscription (with auto-renewal support)
router.post('/payment/create-subscription', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const subscriptionSchema = z.object({
      plan: z.enum(['pro', 'max']),
      autoRenew: z.boolean().default(true)
    });

    const parse = subscriptionSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { plan, autoRenew } = parse.data;
    const PLANS = getPlans();
    const planConfig = PLANS[plan];

    if (!planConfig) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    if (!planConfig.planId) {
      return res.status(500).json({
        error: 'Razorpay plan is not configured',
        message: `Missing plan ID for ${plan}. Set RAZORPAY_PLAN_ID_${plan.toUpperCase()} (or test equivalent) in server env.`,
      });
    }

    // Check if user has existing subscription
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('premium_tier, razorpay_subscription_id, razorpay_payment_id, subscription_status, subscription_end_date, subscription_id, is_premium')
      .eq('user_id', req.userId)
      .single();

    const existingProfileData = existingProfile as SubscriptionProfile | null;
    if (existingProfileData && isManualAdminGrant(existingProfileData)) {
      const manualAccess = evaluateSubscriptionAccess(existingProfileData);
      if (manualAccess.isPremium) {
        const tierLabel = manualAccess.premiumTier === 'max' ? 'IQ Max' : 'IQ Pro';
        return res.status(400).json({
          error: 'You already have an active subscription',
          message: `Your ${tierLabel} plan is active. Contact support if you need to change plans.`,
        });
      }
    }

    const existingTier = (existingProfile as any)?.premium_tier || 'free';
    const existingSubscriptionId = (existingProfile as any)?.razorpay_subscription_id;
    const hasCompletedRazorpayPayment = Boolean((existingProfile as any)?.razorpay_payment_id);
    const paidPeriodActive = hasValidPaidPeriod(existingProfile as never);
    let isActive = paidPeriodActive;

    // Legacy: status active in DB but checkout never completed
    if (!isActive && (existingProfile as any)?.subscription_status === 'active' && hasCompletedRazorpayPayment) {
      isActive = true;
    }
    if ((existingProfile as any)?.subscription_status === 'active' && existingSubscriptionId && !hasCompletedRazorpayPayment) {
      isActive = false;
    }

    const razorpay = getRazorpayInstance();

    // Cancel abandoned Razorpay subscriptions so checkout always gets a fresh sub.
    if (existingSubscriptionId) {
      try {
        const existingSub = await razorpay.subscriptions.fetch(existingSubscriptionId) as any;
        if (['created', 'authenticated'].includes(existingSub.status)) {
          await razorpay.subscriptions.cancel(existingSubscriptionId);
          isActive = false;
        }
      } catch (error: any) {
        console.error('Could not fetch/cancel existing Razorpay subscription:', error);
      }
    }

    const newPlanLevel = getPlanLevel(planConfig.tier);
    const existingPlanLevel = getPlanLevel(existingTier);

    // Plan switching logic
    let switchType: 'new' | 'upgrade' | 'downgrade' = 'new';
    let keepAccessUntil: Date | null = null;
    let proratedAmount = 0; // Amount to credit/charge for upgrade

    if (isActive && existingSubscriptionId) {
      if (newPlanLevel > existingPlanLevel) {
        // UPGRADING (Pro → Max): Switch immediately with proration
        switchType = 'upgrade';
        
        // Calculate proration: unused days from lower plan
        const existingEndDate = existingProfile && (existingProfile as any).subscription_end_date
          ? new Date((existingProfile as any).subscription_end_date)
          : null;
        
        if (existingEndDate) {
          const now = new Date();
          const daysRemaining = Math.ceil((existingEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const totalDaysInPeriod = 30; // Monthly subscription
          
        if (daysRemaining > 0 && daysRemaining <= totalDaysInPeriod) {
          // Calculate unused value from lower plan (what they already paid but won't use)
          const lowerPlanAmount = existingTier === 'pro' ? PLANS.pro.amount : PLANS.max.amount;
          const unusedLowerPlanValue = Math.floor((lowerPlanAmount * daysRemaining) / totalDaysInPeriod);
          
          // Calculate prorated amount for higher plan for remaining days
          const higherPlanAmount = planConfig.amount;
          const proratedHigherPlan = Math.floor((higherPlanAmount * daysRemaining) / totalDaysInPeriod);
          
          // Amount user should pay = difference between higher and lower plan for remaining days
          // This is what they should pay on top of what they already paid
          proratedAmount = proratedHigherPlan - unusedLowerPlanValue;
          
          // If prorated amount is negative (rare case), set to 0
          if (proratedAmount < 0) proratedAmount = 0;
        }
        }
        
        // Cancel old subscription
        try {
          await razorpay.subscriptions.cancel(existingSubscriptionId);
        } catch (error: any) {
          console.error('Error cancelling old subscription:', error);
          // Continue anyway
        }
      } else if (newPlanLevel < existingPlanLevel) {
        // DOWNGRADING (Max → Pro): Switch at end of current billing period
        // Cancel old subscription, but keep higher tier access until period ends
        // New subscription starts after old one ends
        switchType = 'downgrade';
        if (existingProfile && (existingProfile as any).subscription_end_date) {
          keepAccessUntil = new Date((existingProfile as any).subscription_end_date);
        }
        try {
          await razorpay.subscriptions.cancel(existingSubscriptionId);
        } catch (error: any) {
          console.error('Error cancelling old subscription:', error);
        }
      } else {
        // Same plan - just update auto-renewal if needed
        return res.status(400).json({ 
          error: 'You are already subscribed to this plan',
          message: 'Use the toggle to change auto-renewal settings'
        });
      }
    }

    // Get user email and name
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    let userEmail = '';
    let userName = '';
    
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userEmail = user.email || '';
        userName = user.user_metadata?.name || 'User';
      }
    }

    let subscription: any;
    let unusedLowerPlanValue = 0;

    if (switchType === 'upgrade' && proratedAmount > 0) {
      const existingEndDate = existingProfile && (existingProfile as any).subscription_end_date
        ? new Date((existingProfile as any).subscription_end_date)
        : null;

      if (existingEndDate) {
        const now = new Date();
        const daysRemaining = Math.ceil((existingEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const totalDaysInPeriod = 30;

        if (daysRemaining > 0 && daysRemaining <= totalDaysInPeriod) {
          const lowerPlanAmount = existingTier === 'pro' ? PLANS.pro.amount : PLANS.max.amount;
          unusedLowerPlanValue = Math.floor((lowerPlanAmount * daysRemaining) / totalDaysInPeriod);
        }
      }
    }

    // Razorpay requires total_count >= 1 (0 is invalid). For auto-renew monthly plans,
    // use 20 cycles (20 months). Users can cancel anytime via /payment/cancel.
    // Do NOT set start_at for new/upgrades — subscription must auth immediately at checkout.
    const subscriptionOptions: {
      plan_id: string;
      customer_notify: 1;
      total_count: number;
      notes: Record<string, string>;
      start_at?: number;
    } = {
      plan_id: planConfig.planId,
      customer_notify: 1,
      total_count: autoRenew ? 20 : 1,
      notes: {
        userId: req.userId,
        plan: plan,
        tier: planConfig.tier,
        autoRenew: autoRenew.toString(),
        switchType: switchType,
        proratedAmount: proratedAmount.toString(),
        unusedLowerPlanValue: unusedLowerPlanValue.toString(),
        originalTier: existingTier,
        requiresRefund: (unusedLowerPlanValue > 0).toString(),
        daysRemaining: existingProfile && (existingProfile as any).subscription_end_date
          ? Math.ceil((new Date((existingProfile as any).subscription_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)).toString()
          : '0'
      },
    };

    if (switchType === 'downgrade' && keepAccessUntil) {
      subscriptionOptions.start_at = Math.floor(keepAccessUntil.getTime() / 1000);
    }

    subscription = await razorpay.subscriptions.create(subscriptionOptions) as any;

    console.log(`Razorpay subscription created: ${subscription.id} status=${subscription.status} for user ${req.userId}`);

    // Calculate subscription dates (used after payment verification / webhook)
    const startDate = switchType === 'downgrade' && keepAccessUntil
      ? keepAccessUntil
      : new Date();

    let endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    // Store pending subscription only — activate premium after successful payment.
    const keepPaidTierDuringDowngrade = switchType === 'downgrade' && isActive;
    const preservePaidSnapshot = paidPeriodActive && switchType !== 'new';

    await supabase
      .from('user_profiles')
      .update({
        razorpay_subscription_id: subscription.id,
        razorpay_plan_id: planConfig.planId,
        razorpay_payment_id: preservePaidSnapshot
          ? (existingProfile as any).razorpay_payment_id
          : null,
        auto_renew: autoRenew,
        subscription_status: preservePaidSnapshot
          ? (existingProfile as any).subscription_status
          : 'inactive',
        premium_tier: preservePaidSnapshot || keepPaidTierDuringDowngrade ? existingTier : 'free',
        is_premium: preservePaidSnapshot || keepPaidTierDuringDowngrade ? existingTier !== 'free' : false,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('user_id', req.userId);

    res.json({
      subscriptionId: subscription.id,
      planId: planConfig.planId,
      amount: planConfig.amount, // Full subscription amount (will be charged)
      currency: planConfig.currency,
      keyId: getRazorpayCredentials().keyId,
      autoRenew: autoRenew,
      switchType: switchType,
      proratedAmount: proratedAmount > 0 ? proratedAmount : null,
      unusedLowerPlanValue: unusedLowerPlanValue > 0 ? unusedLowerPlanValue : null,
      message: switchType === 'upgrade' 
        ? proratedAmount > 0
          ? `Upgrading to ${planConfig.name}. You'll be charged ₹${(planConfig.amount / 100).toFixed(2)}. A refund of ₹${(unusedLowerPlanValue / 100).toFixed(2)} (unused lower plan value) will be processed within 5-7 business days.`
          : `Upgrading to ${planConfig.name}. Complete payment to activate your new plan.`
        : switchType === 'downgrade'
        ? `Downgrade scheduled. You'll keep ${existingTier === 'max' ? 'IQ Max' : 'IQ Pro'} access until ${keepAccessUntil?.toLocaleDateString()}, then switch to ${planConfig.name}.`
        : 'Subscription created successfully!'
    });
  } catch (error: any) {
    console.error('Create subscription error:', error);
    const razorpayMessage =
      error?.error?.description ||
      error?.error?.reason ||
      error?.message;
    res.status(500).json({
      error: razorpayMessage || 'Failed to create subscription',
      message: razorpayMessage,
    });
  }
});

// Verify prorated payment (for upgrades)
router.post('/payment/verify-prorated', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const verifySchema = z.object({
      razorpay_order_id: z.string(),
      razorpay_payment_id: z.string(),
      razorpay_signature: z.string()
    });

    const parse = verifySchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parse.data;

    // Verify signature
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto
      .createHmac('sha256', getRazorpayCredentials().keySecret)
      .update(text)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Prorated payment verified - user can now proceed with subscription
    res.json({
      success: true,
      message: 'Prorated payment verified. You can now complete the subscription.'
    });
  } catch (error: any) {
    console.error('Verify prorated payment error:', error);
    res.status(500).json({ 
      error: 'Failed to verify prorated payment',
      message: error.message 
    });
  }
});

// Verify subscription payment and activate
router.post('/payment/verify-subscription', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const verifySchema = z.object({
      razorpay_subscription_id: z.string(),
      razorpay_payment_id: z.string(),
      razorpay_signature: z.string()
    });

    const parse = verifySchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature } = parse.data;

    const creds = getRazorpayCredentials();
    if (!creds.keySecret) {
      return res.status(500).json({ error: 'Razorpay is not configured on the server' });
    }

    // Verify signature: payment_id|subscription_id (NOT the reverse — that caused Invalid Signature).
    let signatureOk = verifySubscriptionCheckoutSignature(
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      creds.keySecret
    );

    if (!signatureOk) {
      console.warn(
        `⚠️ Razorpay signature mismatch (mode=${creds.mode}, key=${creds.keyId?.slice(0, 12)}…). ` +
          `Will try API confirmation for sub=${razorpay_subscription_id} pay=${razorpay_payment_id}`
      );
    }

    // Verify subscription exists and belongs to user
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('razorpay_subscription_id, razorpay_plan_id, auto_renew')
      .eq('user_id', req.userId)
      .single();

    if (!profile || (profile as any).razorpay_subscription_id !== razorpay_subscription_id) {
      return res.status(400).json({ error: 'Subscription not found or does not belong to user' });
    }

    const razorpay = getRazorpayInstance();
    const subscription = await razorpay.subscriptions.fetch(razorpay_subscription_id) as any;

    const validSubscriptionStatuses = ['active', 'authenticated'];
    if (!validSubscriptionStatuses.includes(subscription.status)) {
      return res.status(400).json({
        error: 'Subscription payment is not complete yet',
        message: `Razorpay subscription status: ${subscription.status}`,
      });
    }

    let paymentStatus: string | null = null;
    try {
      const payment = await razorpay.payments.fetch(razorpay_payment_id) as any;
      paymentStatus = payment.status;
      if (paymentStatus !== 'captured' && paymentStatus !== 'authorized') {
        return res.status(400).json({
          error: 'Payment was not successful',
          message: `Payment status: ${paymentStatus}`,
        });
      }

      // When HMAC failed, only recover if this payment is clearly tied to this subscription.
      if (!signatureOk) {
        const notesSub =
          payment.notes?.subscription_id ||
          payment.notes?.razorpay_subscription_id ||
          null;
        const invoiceId = payment.invoice_id as string | undefined;
        let invoiceMatches = false;
        if (invoiceId) {
          try {
            const invoice = await razorpay.invoices.fetch(invoiceId) as any;
            invoiceMatches = invoice?.subscription_id === razorpay_subscription_id;
          } catch {
            invoiceMatches = false;
          }
        }
        const notesMatch = notesSub === razorpay_subscription_id;
        if (!invoiceMatches && !notesMatch) {
          console.error(
            `Refusing activation: signature invalid and payment ${razorpay_payment_id} ` +
              `not linked to subscription ${razorpay_subscription_id}`
          );
          return res.status(400).json({ error: 'Invalid payment signature' });
        }
        console.warn(
          `⚠️ Activating via Razorpay API confirmation after signature mismatch ` +
            `(payment=${razorpay_payment_id}, status=${paymentStatus}, sub=${subscription.status})`
        );
      }
    } catch (paymentError: any) {
      console.error('Razorpay payment fetch error:', paymentError);
      if (!signatureOk) {
        return res.status(400).json({ error: 'Invalid payment signature' });
      }
      return res.status(400).json({ error: 'Could not verify payment with Razorpay' });
    }
    
    // Determine plan from notes (authoritative) then stored / Razorpay plan IDs
    const PLANS = getPlans();
    let plan: 'pro' | 'max';
    try {
      plan = resolvePlanOrThrow({
        planIds: { pro: PLANS.pro.planId, max: PLANS.max.planId },
        storedPlanId: (profile as any).razorpay_plan_id,
        razorpayPlanId: subscription.plan_id,
        notes: subscription.notes || {},
      });
    } catch (resolveError: any) {
      console.error('Plan resolve error on verify:', resolveError);
      return res.status(400).json({
        error: 'Could not determine subscription plan',
        message: resolveError.message,
      });
    }
    const planConfig = PLANS[plan];

    // Calculate subscription dates
    const startDate = new Date(subscription.created_at * 1000);
    const endDate = new Date((subscription.current_start || subscription.created_at) * 1000);
    endDate.setMonth(endDate.getMonth() + 1); // Add 1 month

    try {
      await activatePremiumForUser({
        userId: req.userId,
        plan,
        paymentId: razorpay_payment_id,
        startDate,
        endDate,
        autoRenew: (profile as any).auto_renew ?? true,
      });
    } catch (updateError: any) {
      console.error('Update profile error:', updateError);
      return res.status(500).json({ error: 'Failed to activate subscription' });
    }

    console.log(
      `Verified Razorpay payment ${razorpay_payment_id} → activated ${planConfig.tier} for user ${req.userId}`
    );

    res.json({
      success: true,
      message: `${planConfig.name} activated successfully`,
      tier: planConfig.tier,
      plan: plan,
      subscriptionEndDate: endDate.toISOString(),
      autoRenew: (profile as any).auto_renew ?? true
    });
  } catch (error: any) {
    console.error('Verify subscription error:', error);
    res.status(500).json({ 
      error: 'Failed to verify subscription',
      message: error.message 
    });
  }
});

// Webhook handler for subscription events (renewals, cancellations, etc.)
router.post('/payment/webhook', async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'] as string;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const webhookBody = rawBody ? rawBody.toString('utf8') : JSON.stringify(req.body);

    // Verify webhook signature (prefer dedicated webhook secret)
    const { webhookSecret, keySecret } = getRazorpayCredentials();
    const secret = webhookSecret || keySecret;
    if (!secret) {
      console.error('Razorpay webhook secret is not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(webhookBody)
      .digest('hex');

    if (webhookSignature !== expectedSignature) {
      console.warn('Invalid Razorpay webhook signature');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const subscription = req.body.payload.subscription?.entity || req.body.payload.subscription;
    const payment = req.body.payload.payment?.entity || req.body.payload.payment;
    const PLANS = getPlans();

    // Handle different subscription events
    switch (event) {
      case 'subscription.activated':
      case 'subscription.charged': {
        if (!subscription) break;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_id, razorpay_plan_id, auto_renew')
          .eq('razorpay_subscription_id', subscription.id)
          .single();

        if (!profile) break;

        let plan: 'pro' | 'max';
        try {
          plan = resolvePlanOrThrow({
            planIds: { pro: PLANS.pro.planId, max: PLANS.max.planId },
            storedPlanId: (profile as any).razorpay_plan_id,
            razorpayPlanId: subscription.plan_id,
            notes: subscription.notes || {},
          });
        } catch (resolveError) {
          console.error('Webhook plan resolve failed:', resolveError);
          break;
        }
        const planConfig = PLANS[plan];

        const startDate = new Date(
          (subscription.current_start || subscription.created_at || Date.now() / 1000) * 1000
        );
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);

        const paymentId =
          payment?.id || `rzp_confirmed_${subscription.id}`;

        // Check if this is an upgrade that requires refund
        const subscriptionNotes = subscription.notes || {};
        const requiresRefund = subscriptionNotes.requiresRefund === 'true';
        const unusedLowerPlanValue = parseInt(subscriptionNotes.unusedLowerPlanValue || '0', 10);

        if (requiresRefund && unusedLowerPlanValue > 0 && payment?.id) {
          try {
            const razorpay = getRazorpayInstance();
            const daysRemaining = parseInt(subscriptionNotes.daysRemaining || '0', 10);
            const proratedHigherPlan =
              daysRemaining > 0
                ? Math.floor((planConfig.amount * daysRemaining) / 30)
                : 0;
            const overpaymentForHigherPlan = planConfig.amount - proratedHigherPlan;
            const totalRefund = overpaymentForHigherPlan + unusedLowerPlanValue;

            await razorpay.payments.refund(payment.id, {
              amount: totalRefund,
              notes: {
                reason: 'upgrade_proration',
                originalPlan: subscriptionNotes.originalTier,
                newPlan: planConfig.tier,
                message: 'Proration refund: unused lower plan + overpayment for higher plan',
              },
            } as any);
            console.log(`Refunded ₹${totalRefund / 100} for upgrade proration`);
          } catch (error: any) {
            console.error('Error processing refund:', error);
          }
        }

        await activatePremiumForUser({
          userId: (profile as any).user_id,
          plan,
          paymentId,
          startDate,
          endDate,
          autoRenew: (profile as any).auto_renew ?? true,
        });

        console.log(
          `Webhook ${event}: activated ${plan} for user ${(profile as any).user_id}`
        );
        break;
      }

      case 'subscription.cancelled':
      case 'subscription.paused':
        // Subscription cancelled or paused
        if (subscription) {
          await supabase
            .from('user_profiles')
            .update({
              subscription_status: event === 'subscription.cancelled' ? 'cancelled' : 'paused',
              // Don't downgrade immediately - keep access until period ends
              updated_at: new Date().toISOString()
            } as any)
            .eq('razorpay_subscription_id', subscription.id);
        }
        break;

      case 'subscription.completed':
        // Subscription completed (no more renewals)
        if (subscription) {
          await supabase
            .from('user_profiles')
            .update({
              subscription_status: 'expired',
              premium_tier: 'free',
              is_premium: false,
              updated_at: new Date().toISOString()
            } as any)
            .eq('razorpay_subscription_id', subscription.id)
            .not('subscription_id', 'like', 'manual_%');
        }
        break;
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get subscription status
router.get('/payment/subscription', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let { data: profile } = await supabase
      .from('user_profiles')
      .select('premium_tier, is_premium, subscription_status, subscription_start_date, subscription_end_date, auto_renew, razorpay_subscription_id, razorpay_payment_id, razorpay_plan_id, subscription_id')
      .eq('user_id', req.userId)
      .single();

    if (!profile) {
      return res.json({
        tier: 'free',
        status: 'inactive',
        isActive: false,
        autoRenew: false
      });
    }

    let profileData = profile as SubscriptionProfile;

    // Recover Pro/Max if Razorpay charged but client verify never completed (Android UPI).
    if (isUnpaidRazorpayNeedingSync(profileData)) {
      try {
        const synced = await syncPendingRazorpaySubscription(req.userId, profileData);
        if (synced) {
          profileData = synced;
        }
      } catch (syncError) {
        console.error('Razorpay subscription sync failed:', syncError);
      }
    }

    const access = evaluateSubscriptionAccess(profileData);
    await persistSubscriptionAccessFix(req.userId, access, profileData);
    await persistManualGrantSnapshot(req.userId, profileData, access);

    const endDate = profileData.subscription_end_date as string | null | undefined;
    const autoRenew = (profileData.auto_renew as boolean | undefined) ?? true;

    res.json({
      tier: access.premiumTier,
      status: access.subscriptionStatus,
      isActive: access.isPremium,
      subscriptionEndDate: endDate || null,
      autoRenew: autoRenew,
      subscriptionId: (profileData.razorpay_subscription_id as string | null) || null,
      isCancelled: access.subscriptionStatus === 'cancelled' && access.isPremium
    });
  } catch (error: any) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

function isUnpaidRazorpayNeedingSync(profile: SubscriptionProfile): boolean {
  return Boolean(profile.razorpay_subscription_id) && !profile.razorpay_payment_id;
}

// Toggle auto-renewal
router.post('/payment/toggle-auto-renew', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const toggleSchema = z.object({
      autoRenew: z.boolean()
    });

    const parse = toggleSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { autoRenew } = parse.data;

    // Get current subscription
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('razorpay_subscription_id')
      .eq('user_id', req.userId)
      .single();

    if (profile && (profile as any).razorpay_subscription_id) {
      // Update subscription in Razorpay
      const subscriptionId = (profile as any).razorpay_subscription_id;
      
      const razorpay = getRazorpayInstance();
      if (autoRenew) {
        // Resume subscription (enable auto-renew)
        await razorpay.subscriptions.resume(subscriptionId, {
          resume_at: 'now'
        } as any);
      } else {
        // Pause subscription (disable auto-renew after current period)
        await razorpay.subscriptions.pause(subscriptionId, {
          pause_at: 'now'
        } as any);
      }
    }

    // Update auto-renew preference in database
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        auto_renew: autoRenew,
        updated_at: new Date().toISOString()
      } as any)
      .eq('user_id', req.userId);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update auto-renew setting' });
    }

    res.json({ 
      success: true,
      message: `Auto-renewal ${autoRenew ? 'enabled' : 'disabled'}`,
      autoRenew: autoRenew
    });
  } catch (error: any) {
    console.error('Toggle auto-renew error:', error);
    res.status(500).json({ error: 'Failed to update auto-renew setting' });
  }
});

// Cancel subscription
router.post('/payment/cancel', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get subscription ID
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('razorpay_subscription_id')
      .eq('user_id', req.userId)
      .single();

    if (profile && (profile as any).razorpay_subscription_id) {
      // Cancel subscription in Razorpay
      try {
        const razorpay = getRazorpayInstance();
        await razorpay.subscriptions.cancel((profile as any).razorpay_subscription_id);
      } catch (error: any) {
        console.error('Razorpay cancel error:', error);
        // Continue with database update even if Razorpay cancel fails
      }
    }

    // Update subscription status to cancelled
    // Note: User keeps access until subscription_end_date (they paid for the full period)
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        subscription_status: 'cancelled',
        auto_renew: false,
        updated_at: new Date().toISOString()
        // Don't downgrade immediately - keep premium_tier until subscription_end_date
        // The tier will be downgraded when subscription_end_date passes (handled in get subscription status)
      } as any)
      .eq('user_id', req.userId);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to cancel subscription' });
    }

    res.json({ 
      success: true,
      message: 'Subscription cancelled. You will retain access until the end of your billing period.'
    });
  } catch (error: any) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;
