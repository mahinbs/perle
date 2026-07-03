// Create Razorpay plans for IQ Pro and IQ Max (live or test credentials).
//
// Production plans:
//   npm run create-razorpay-plans
//
// Test plans:
//   npm run create-razorpay-plans:test
//
// Or: node scripts/create-razorpay-plans.js [--test]

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const useTest = process.argv.includes('--test') || process.env.RAZORPAY_MODE === 'test';

const keyId = useTest
  ? process.env.RAZORPAY_TEST_KEY_ID
  : process.env.RAZORPAY_KEY_ID;
const keySecret = useTest
  ? process.env.RAZORPAY_TEST_KEY_SECRET
  : process.env.RAZORPAY_KEY_SECRET;

const planEnvPrefix = useTest ? 'RAZORPAY_TEST_PLAN_ID' : 'RAZORPAY_PLAN_ID';
const modeLabel = useTest ? 'TEST' : 'LIVE';

const razorpay = new Razorpay({
  key_id: keyId || '',
  key_secret: keySecret || '',
});

async function createPlans() {
  try {
    if (!keyId || !keySecret) {
      throw new Error(
        useTest
          ? 'Set RAZORPAY_TEST_KEY_ID and RAZORPAY_TEST_KEY_SECRET in server/.env'
          : 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env'
      );
    }

    console.log(`Creating Razorpay ${modeLabel} plans...\n`);

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
    console.log(`   Add to .env: ${planEnvPrefix}_PRO=${proPlan.id}\n`);

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
    console.log(`   Add to .env: ${planEnvPrefix}_MAX=${maxPlan.id}\n`);

    console.log('📝 Add these to your server/.env file:');
    console.log(`${planEnvPrefix}_PRO=${proPlan.id}`);
    console.log(`${planEnvPrefix}_MAX=${maxPlan.id}\n`);

    console.log(`✅ ${modeLabel} plans created successfully!`);
  } catch (error) {
    console.error('❌ Error creating plans:', error);
    if (error.error) {
      console.error('   Details:', error.error.description);
    }
    process.exit(1);
  }
}

createPlans();
