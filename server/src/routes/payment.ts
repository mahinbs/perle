import { Router } from 'express';
import { z } from 'zod';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import {
  getRazorpayCredentials,
  getRazorpayPlanIds,
} from '../utils/razorpayConfig.js';
import {
  evaluateSubscriptionAccess,
  persistSubscriptionAccessFix,
  persistManualGrantSnapshot,
  isManualAdminGrant,
  type SubscriptionProfile,
} from '../utils/subscriptionAccess.js';

const router = Router();

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
          : 'Upgrade successful! You now have access to the higher plan.'
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

    // Verify signature
    const text = `${razorpay_subscription_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto
      .createHmac('sha256', getRazorpayCredentials().keySecret)
      .update(text)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
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
    } catch (paymentError: any) {
      console.error('Razorpay payment fetch error:', paymentError);
      return res.status(400).json({ error: 'Could not verify payment with Razorpay' });
    }
    
    // Determine plan from subscription
    const PLANS = getPlans();
    const planId = (profile as any).razorpay_plan_id || subscription.plan_id;
    const plan = planId === PLANS.pro.planId ? 'pro' : 'max';
    const planConfig = PLANS[plan];

    // Calculate subscription dates
    const startDate = new Date(subscription.created_at * 1000);
    const endDate = new Date((subscription.current_start || subscription.created_at) * 1000);
    endDate.setMonth(endDate.getMonth() + 1); // Add 1 month

    // Update user profile with premium tier and subscription info
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        premium_tier: planConfig.tier,
        is_premium: true,
        razorpay_payment_id: razorpay_payment_id,
        subscription_id: `sub_${req.userId}_${Date.now()}`,
        subscription_start_date: startDate.toISOString(),
        subscription_end_date: endDate.toISOString(),
        subscription_status: 'active',
        auto_renew: (profile as any).auto_renew ?? true,
        updated_at: new Date().toISOString()
      } as any)
      .eq('user_id', req.userId);

    if (updateError) {
      console.error('Update profile error:', updateError);
      return res.status(500).json({ error: 'Failed to activate subscription' });
    }

    res.json({
      success: true,
      message: 'Subscription activated successfully',
      tier: planConfig.tier,
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
    const webhookBody = JSON.stringify(req.body);

    // Verify webhook signature
    const { webhookSecret, keySecret } = getRazorpayCredentials();
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret || keySecret)
      .update(webhookBody)
      .digest('hex');

    if (webhookSignature !== expectedSignature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const subscription = req.body.payload.subscription?.entity || req.body.payload.subscription;
    const payment = req.body.payload.payment?.entity || req.body.payload.payment;
    const PLANS = getPlans();

    // Handle different subscription events
    switch (event) {
      case 'subscription.activated':
      case 'subscription.charged':
        // Subscription activated or renewed
        if (subscription && payment) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('user_id, razorpay_plan_id')
            .eq('razorpay_subscription_id', subscription.id)
            .single();

          if (profile) {
            const planId = (profile as any).razorpay_plan_id || subscription.plan_id;
            const plan = planId === PLANS.pro.planId ? 'pro' : 'max';
            const planConfig = PLANS[plan];

            const startDate = new Date(subscription.current_start * 1000);
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);

            // Check if this is an upgrade that requires refund
            const subscriptionNotes = subscription.notes || {};
            const requiresRefund = subscriptionNotes.requiresRefund === 'true';
            const unusedLowerPlanValue = parseInt(subscriptionNotes.unusedLowerPlanValue || '0');

            // Process refund for upgrade proration
            // User paid full subscription amount (e.g., ₹899), but should only pay:
            // = (Prorated higher plan for remaining days) - (Unused lower plan value)
            // = Prorated difference
            // 
            // Since they paid full amount, we need to refund:
            // = Full amount - (What they should pay)
            // = Full amount - (Prorated higher plan - Unused lower plan)
            // = Full amount - Prorated higher plan + Unused lower plan
            // = (Full amount - Prorated higher plan) + Unused lower plan
            // = Overpayment for higher plan + Unused lower plan value
            if (requiresRefund && unusedLowerPlanValue > 0 && payment.id) {
              try {
                const razorpay = getRazorpayInstance();
                
                // Calculate what they should pay for remaining days of higher plan
                const daysRemaining = parseInt(subscriptionNotes.daysRemaining || '0');
                const proratedHigherPlan = daysRemaining > 0 
                  ? Math.floor((planConfig.amount * daysRemaining) / 30)
                  : 0;
                
                // Refund amount = Full amount paid - What they should pay
                // What they should pay = Prorated higher plan - Unused lower plan value
                // So refund = Full amount - (Prorated higher plan - Unused lower plan)
                // = Full amount - Prorated higher plan + Unused lower plan
                const overpaymentForHigherPlan = planConfig.amount - proratedHigherPlan;
                const totalRefund = overpaymentForHigherPlan + unusedLowerPlanValue;
                
                // Create partial refund
                await razorpay.payments.refund(payment.id, {
                  amount: totalRefund,
                  notes: {
                    reason: 'upgrade_proration',
                    originalPlan: subscriptionNotes.originalTier,
                    newPlan: planConfig.tier,
                    message: `Proration refund: unused lower plan + overpayment for higher plan`
                  }
                } as any);
                console.log(`Refunded ₹${totalRefund / 100} for upgrade proration`);
              } catch (error: any) {
                console.error('Error processing refund:', error);
                // Don't fail the subscription activation if refund fails
                // Can be processed manually later via Razorpay dashboard
              }
            }

            await supabase
              .from('user_profiles')
              .update({
                premium_tier: planConfig.tier,
                is_premium: true,
                subscription_status: 'active',
                subscription_start_date: startDate.toISOString(),
                subscription_end_date: endDate.toISOString(),
                razorpay_payment_id: payment.id,
                updated_at: new Date().toISOString()
              } as any)
              .eq('user_id', (profile as any).user_id);
          }
        }
        break;

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

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('premium_tier, is_premium, subscription_status, subscription_start_date, subscription_end_date, auto_renew, razorpay_subscription_id, razorpay_payment_id, razorpay_plan_id, stripe_subscription_id, stripe_customer_id, subscription_id')
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

    const profileData = profile as SubscriptionProfile;
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
