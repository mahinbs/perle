import { getRazorpayPlanIds } from './razorpayConfig.js';

/** Resolve plan IDs for the active RAZORPAY_MODE (live or test). */
export function getActiveRazorpayPlanIds() {
  return getRazorpayPlanIds();
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
