// Script to create Razorpay plans for IQ Pro and IQ Max
// Run this once to set up plans: node scripts/create-razorpay-plans.js

const Razorpay = require('razorpay');
require('dotenv').config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

async function createPlans() {
  try {
    console.log('Creating Razorpay plans...\n');

    // Create IQ Pro Plan (₹399/month)
    const proPlan = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'IQ Pro',
        amount: 39900, // ₹399 in paise
        currency: 'INR',
        description: 'Perfect for creators and strategists who need faster answers, longer conversations, and richer exports.'
      }
    });

    console.log('✅ IQ Pro Plan Created:');
    console.log(`   Plan ID: ${proPlan.id}`);
    console.log(`   Amount: ₹${proPlan.item.amount / 100}/month`);
    console.log(`   Add to .env: RAZORPAY_PLAN_ID_PRO=${proPlan.id}\n`);

    // Create IQ Max Plan (₹899/month)
    const maxPlan = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'IQ Max',
        amount: 89900, // ₹899 in paise
        currency: 'INR',
        description: 'Built for teams running mission-critical workflows with the highest limits and premium support.'
      }
    });

    console.log('✅ IQ Max Plan Created:');
    console.log(`   Plan ID: ${maxPlan.id}`);
    console.log(`   Amount: ₹${maxPlan.item.amount / 100}/month`);
    console.log(`   Add to .env: RAZORPAY_PLAN_ID_MAX=${maxPlan.id}\n`);

    console.log('📝 Add these to your .env file:');
    console.log(`RAZORPAY_PLAN_ID_PRO=${proPlan.id}`);
    console.log(`RAZORPAY_PLAN_ID_MAX=${maxPlan.id}\n`);

    console.log('✅ Plans created successfully!');
  } catch (error) {
    console.error('❌ Error creating plans:', error);
    if (error.error) {
      console.error('   Details:', error.error.description);
    }
    process.exit(1);
  }
}

createPlans();

