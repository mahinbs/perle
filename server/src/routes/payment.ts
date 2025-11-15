import { Router } from 'express';
import { z } from 'zod';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { RAZORPAY_PLAN_IDS } from '../utils/razorpayPlans.js';

const router = Router();

// Lazy initialization of Razorpay (only when needed)
function getRazorpayInstance() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  
  if (!keyId || !keySecret) {
    throw new Error('Razorpay API keys are not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file.');
  }
  
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
}

// Plan configurations
const PLANS = {
  pro: {
    name: 'IQ Pro',
    amount: 39900, // ₹399 in paise
    currency: 'INR',
    description: 'Perfect for creators and strategists',
    tier: 'pro' as const,
    planId: RAZORPAY_PLAN_IDS.pro
  },
  max: {
    name: 'IQ Max',
    amount: 89900, // ₹899 in paise
    currency: 'INR',
    description: 'Built for teams running mission-critical workflows',
    tier: 'max' as const,
    planId: RAZORPAY_PLAN_IDS.max
  }
};

// Helper to determine plan hierarchy
function getPlanLevel(tier: string): number {
  if (tier === 'max') return 2;
  if (tier === 'pro') return 1;
  return 0; // free
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
    const planConfig = PLANS[plan];

    if (!planConfig) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    // Check if user has existing subscription
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('premium_tier, razorpay_subscription_id, subscription_status, subscription_end_date')
      .eq('user_id', req.userId)
      .single();

    const existingTier = (existingProfile as any)?.premium_tier || 'free';
    const existingSubscriptionId = (existingProfile as any)?.razorpay_subscription_id;
    const isActive = (existingProfile as any)?.subscription_status === 'active';
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
          const razorpay = getRazorpayInstance();
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
          const razorpay = getRazorpayInstance();
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

    // Calculate subscription start date
    // If downgrading, new subscription starts after old one ends
    // If upgrading, new subscription starts immediately
    let subscriptionStartTime = Math.floor(Date.now() / 1000) + 60; // Default: start in 60 seconds
    
    if (switchType === 'downgrade' && keepAccessUntil) {
      // For downgrades, schedule new subscription to start when old one ends
      subscriptionStartTime = Math.floor(keepAccessUntil.getTime() / 1000);
    }

    // For upgrades with proration: Calculate what user should pay
    // Since Razorpay subscriptions charge full amount, we have two options:
    // Option 1: Charge prorated amount now, subscription starts from next cycle (complex)
    // Option 2: Charge full subscription amount, then issue partial refund (simpler)
    // We'll use Option 2: Create subscription (charges full), then refund unused lower plan value
    
    let subscription: any;
    let unusedLowerPlanValue = 0; // Amount to refund (unused lower plan value)
    
    if (switchType === 'upgrade' && proratedAmount > 0) {
      // unusedLowerPlanValue is already calculated above in the upgrade logic
      // It represents the value of unused days from the lower plan
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

    // Create Razorpay subscription
    const subscriptionOptions = {
      plan_id: planConfig.planId,
      customer_notify: 1 as 1,
      total_count: autoRenew ? 0 : 1, // 0 = infinite (auto-renew), 1 = one-time
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
      start_at: subscriptionStartTime
    };

    const razorpay = getRazorpayInstance();
    subscription = await razorpay.subscriptions.create(subscriptionOptions) as any;

    // Calculate subscription dates
    const startDate = switchType === 'downgrade' && keepAccessUntil 
      ? keepAccessUntil 
      : new Date();
    
    let endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1); // Add 1 month

    // For upgrades: User gets new tier immediately
    // For downgrades: User keeps old tier until old subscription ends, then gets new tier
    const effectiveTier = switchType === 'upgrade' 
      ? planConfig.tier  // Immediate upgrade
      : (switchType === 'downgrade' 
          ? existingTier  // Keep old tier until period ends
          : planConfig.tier); // New subscription

    // Save subscription ID and auto-renew preference to user profile
    await supabase
      .from('user_profiles')
      .update({
        razorpay_subscription_id: subscription.id,
        razorpay_plan_id: planConfig.planId,
        premium_tier: effectiveTier, // Current effective tier
        is_premium: true,
        auto_renew: autoRenew,
        subscription_start_date: startDate.toISOString(),
        subscription_end_date: endDate.toISOString(),
        subscription_status: 'active',
        updated_at: new Date().toISOString()
      } as any)
      .eq('user_id', req.userId);

    res.json({
      subscriptionId: subscription.id,
      planId: planConfig.planId,
      amount: planConfig.amount, // Full subscription amount (will be charged)
      currency: planConfig.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
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
    res.status(500).json({ 
      error: 'Failed to create subscription',
      message: error.message 
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
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
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
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
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

    // Get subscription details from Razorpay
    const razorpay = getRazorpayInstance();
    const subscription = await razorpay.subscriptions.fetch(razorpay_subscription_id) as any;
    
    // Determine plan from subscription
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
        subscription_status: subscription.status === 'active' ? 'active' : 'inactive',
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
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '')
      .update(webhookBody)
      .digest('hex');

    if (webhookSignature !== expectedSignature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const subscription = req.body.payload.subscription?.entity || req.body.payload.subscription;
    const payment = req.body.payload.payment?.entity || req.body.payload.payment;

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
            .eq('razorpay_subscription_id', subscription.id);
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
      .select('premium_tier, subscription_status, subscription_start_date, subscription_end_date, auto_renew, razorpay_subscription_id')
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

    const profileData = profile as any;
    const tier = profileData.premium_tier || 'free';
    const status = profileData.subscription_status || 'inactive';
    const endDate = profileData.subscription_end_date;
    const autoRenew = profileData.auto_renew ?? true;

    // Check if subscription is expired
    let isActive = status === 'active';
    let effectiveTier = tier;
    
    if (endDate) {
      const expiryDate = new Date(endDate);
      const now = new Date();
      if (expiryDate < now) {
        // Subscription period has ended
        if (status === 'active' || status === 'cancelled') {
          // If cancelled, user had access until period ended
          // If active but expired, subscription ended
          isActive = false;
          // Update status to expired and downgrade
          await supabase
            .from('user_profiles')
            .update({
              subscription_status: 'expired',
              premium_tier: 'free',
              is_premium: false
            } as any)
            .eq('user_id', req.userId);
          effectiveTier = 'free';
        } else {
          isActive = false;
        }
      } else if (status === 'cancelled') {
        // Subscription is cancelled but period hasn't ended yet
        // User still has access until endDate
        isActive = true; // They still have access
        effectiveTier = tier; // Keep current tier
      }
    }

    res.json({
      tier: effectiveTier,
      status: isActive ? 'active' : status,
      isActive: isActive,
      subscriptionEndDate: endDate || null,
      autoRenew: autoRenew,
      subscriptionId: profileData.razorpay_subscription_id || null,
      isCancelled: status === 'cancelled' && isActive // Cancelled but still has access
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
