// Razorpay Plan IDs - These need to be created once in Razorpay Dashboard
// Or use the API to create them (see setup script)

// Plan IDs should be created in Razorpay Dashboard or via API
// Format: plan_xxxxxxxxxxxxx

export const RAZORPAY_PLAN_IDS = {
  pro: process.env.RAZORPAY_PLAN_ID_PRO || 'plan_pro_iq_pro', // Replace with actual plan ID
  max: process.env.RAZORPAY_PLAN_ID_MAX || 'plan_max_iq_max'  // Replace with actual plan ID
};

// Helper function to create plans (run once during setup)
export async function createRazorpayPlans(razorpay: any) {
  try {
    // Create IQ Pro Plan (₹399/month)
    const proPlan = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'IQ Pro',
        amount: 39900, // ₹399 in paise
        currency: 'INR',
        description: 'Perfect for creators and strategists'
      }
    });

    // Create IQ Max Plan (₹899/month)
    const maxPlan = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'IQ Max',
        amount: 89900, // ₹899 in paise
        currency: 'INR',
        description: 'Built for teams running mission-critical workflows'
      }
    });

    console.log('Plans created:');
    console.log('IQ Pro Plan ID:', proPlan.id);
    console.log('IQ Max Plan ID:', maxPlan.id);
    
    return {
      pro: proPlan.id,
      max: maxPlan.id
    };
  } catch (error: any) {
    console.error('Error creating plans:', error);
    throw error;
  }
}

