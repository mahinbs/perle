import { getRazorpayPlanIds } from './razorpayConfig.js';

export type RazorpayPlanKey = 'pro' | 'max';

/** Resolve plan IDs for the active RAZORPAY_MODE (live or test). */
export function getActiveRazorpayPlanIds() {
  return getRazorpayPlanIds();
}

/**
 * Resolve Pro vs Max from Razorpay notes / stored plan IDs.
 * Never defaults unknown IDs to Max — returns null so callers can fail safely.
 */
export function resolveRazorpayPlanKey(opts: {
  planIds: { pro: string; max: string };
  storedPlanId?: string | null;
  razorpayPlanId?: string | null;
  notes?: Record<string, unknown> | null;
}): RazorpayPlanKey | null {
  const notes = opts.notes || {};
  const fromNotes = notes.plan ?? notes.tier;
  if (fromNotes === 'pro' || fromNotes === 'max') {
    return fromNotes;
  }

  const planId = (opts.storedPlanId || opts.razorpayPlanId || '').trim();
  if (!planId) return null;

  const proId = (opts.planIds.pro || '').trim();
  const maxId = (opts.planIds.max || '').trim();

  if (proId && planId === proId) return 'pro';
  if (maxId && planId === maxId) return 'max';
  return null;
}

// Helper function to create plans (run once during setup)
export async function createRazorpayPlans(razorpay: { plans: { create: (opts: unknown) => Promise<{ id: string }> } }) {
  try {
    const proPlan = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'IQ Pro',
        amount: 39900,
        currency: 'INR',
        description: 'Perfect for creators and strategists',
      },
    });

    const maxPlan = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'IQ Max',
        amount: 89900,
        currency: 'INR',
        description: 'Built for teams running mission-critical workflows',
      },
    });

    console.log('Plans created:');
    console.log('IQ Pro Plan ID:', proPlan.id);
    console.log('IQ Max Plan ID:', maxPlan.id);

    return {
      pro: proPlan.id,
      max: maxPlan.id,
    };
  } catch (error: unknown) {
    console.error('Error creating plans:', error);
    throw error;
  }
}
