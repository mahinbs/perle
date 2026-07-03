// Script to create Razorpay plans for IQ Pro and IQ Max
// Run from repo root: node server/scripts/create-razorpay-plans.js
// Or from server/: node scripts/create-razorpay-plans.js

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

async function createPlans() {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env');
    }

    console.log('Creating Razorpay plans...\n');

    const proPlan = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'IQ Pro',
        amount: 39900,
        currency: 'INR',
        description:
          'Perfect for creators and strategists who need faster answers, longer conversations, and richer exports.',
      },
    });

    console.log('✅ IQ Pro Plan Created:');
    console.log(`   Plan ID: ${proPlan.id}`);
    console.log(`   Amount: ₹${proPlan.item.amount / 100}/month`);
    console.log(`   Add to .env: RAZORPAY_PLAN_ID_PRO=${proPlan.id}\n`);

    const maxPlan = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'IQ Max',
        amount: 89900,
        currency: 'INR',
        description:
          'Built for teams running mission-critical workflows with the highest limits and premium support.',
      },
    });

    console.log('✅ IQ Max Plan Created:');
    console.log(`   Plan ID: ${maxPlan.id}`);
    console.log(`   Amount: ₹${maxPlan.item.amount / 100}/month`);
    console.log(`   Add to .env: RAZORPAY_PLAN_ID_MAX=${maxPlan.id}\n`);

    console.log('📝 Add these to your server/.env file:');
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
