import express, { Router, Response } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PLANS = {
  pro: {
    name: 'IQ Pro',
    priceId: process.env.STRIPE_PRICE_ID_PRO,
    tier: 'pro' as const,
  },
  max: {
    name: 'IQ Max',
    priceId: process.env.STRIPE_PRICE_ID_MAX,
    tier: 'max' as const,
  }
};

// Create a checkout session
router.post('/payment/stripe/create-checkout-session', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { plan } = z.object({ 
      plan: z.enum(['pro', 'max']) 
    }).parse(req.body);

    const planConfig = PLANS[plan];

    if (!planConfig.priceId) {
      return res.status(400).json({ error: 'Plan price ID not configured in environment' });
    }

    if (!req.userId) {
      return res.status(401).json({ error: 'User ID not found in request' });
    }

    // Get user profile to check for existing customer ID and subscription status
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id, premium_tier, subscription_status')
      .eq('user_id', req.userId)
      .single();

    // Prevent duplicate subscriptions if they are already on this plan or higher
    const currentTier = (profile as any)?.premium_tier;
    const currentStatus = (profile as any)?.subscription_status;
    
    if (currentStatus === 'active' && (currentTier === plan || (currentTier === 'max' && plan === 'pro'))) {
      return res.status(400).json({ error: `You already have an active ${currentTier} subscription.` });
    }

    let customerId = (profile as any)?.stripe_customer_id;

    if (!customerId) {
      // Create a new customer in Stripe
      const customer = await stripe.customers.create({
        email: req.userEmail,
        metadata: {
          userId: req.userId,
        },
      });
      customerId = customer.id;

      // Save the customer ID to the profile
      await supabase
        .from('user_profiles')
        .update({ stripe_customer_id: customerId } as any)
        .eq('user_id', req.userId);
    }

    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: planConfig.priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${FRONTEND_URL}/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/subscription?canceled=true`,
      metadata: {
        userId: req.userId,
        plan: plan,
        tier: planConfig.tier,
      },
      subscription_data: {
        metadata: {
          userId: req.userId,
          plan: plan,
          tier: planConfig.tier,
        },
      },
    });

    console.log(`🎟️ Checkout session created for user ${req.userId}: ${session.id}`);
    res.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe session creation error:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
});

// Stripe Webhook handler
router.post('/payment/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: any;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`🔔 Received Stripe webhook event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const userId = session.metadata?.userId;
        const tier = session.metadata?.tier;
        const subscriptionId = session.subscription as string;

        if (userId && tier) {
          const subscription: any = await stripe.subscriptions.retrieve(subscriptionId);
          
          await supabase
            .from('user_profiles')
            .update({
              premium_tier: tier,
              is_premium: true,
              stripe_subscription_id: subscriptionId,
              stripe_price_id: subscription.items.data[0].price.id,
              subscription_status: 'active',
              subscription_start_date: new Date(subscription.current_period_start * 1000).toISOString(),
              subscription_end_date: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            } as any)
            .eq('user_id', userId);
          
          console.log(`✅ Subscription completed for user ${userId} with tier ${tier}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const userId = subscription.metadata?.userId;

        if (userId) {
          await supabase
            .from('user_profiles')
            .update({
              subscription_status: subscription.status === 'active' ? 'active' : 'inactive',
              subscription_end_date: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            } as any)
            .eq('user_id', userId);
            
          console.log(`🔄 Subscription updated for user ${userId} (Status: ${subscription.status})`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const userId = subscription.metadata?.userId;

        if (userId) {
          await supabase
            .from('user_profiles')
            .update({
              premium_tier: 'free',
              is_premium: false,
              subscription_status: 'inactive',
              updated_at: new Date().toISOString(),
            } as any)
            .eq('user_id', userId);
            
          console.log(`❌ Subscription deleted for user ${userId}`);
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
