/**
 * End-to-end Razorpay test (test mode keys from server/.env)
 * Run: node scripts/test-razorpay-e2e.js
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const useTest = process.env.RAZORPAY_MODE === 'test' || process.argv.includes('--test');

const keyId = useTest ? process.env.RAZORPAY_TEST_KEY_ID : process.env.RAZORPAY_KEY_ID;
const keySecret = useTest ? process.env.RAZORPAY_TEST_KEY_SECRET : process.env.RAZORPAY_KEY_SECRET;
const planPro = useTest ? process.env.RAZORPAY_TEST_PLAN_ID_PRO : process.env.RAZORPAY_PLAN_ID_PRO;
const planMax = useTest ? process.env.RAZORPAY_TEST_PLAN_ID_MAX : process.env.RAZORPAY_PLAN_ID_MAX;
const apiBase = process.env.TEST_API_BASE || 'http://localhost:3334';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('=== Razorpay E2E Test (Test Mode) ===\n');

  assert(keyId?.startsWith(useTest ? 'rzp_test_' : 'rzp_live_'), `Expected ${useTest ? 'test' : 'live'} key in .env`);
  assert(planPro && planMax, 'Plan IDs missing in .env');

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

  // 1) Verify plans exist
  console.log('1. Fetching plans from Razorpay...');
  const pro = await razorpay.plans.fetch(planPro);
  const max = await razorpay.plans.fetch(planMax);
  console.log(`   ✓ IQ Pro: ${pro.id} — ₹${pro.item.amount / 100}/mo`);
  console.log(`   ✓ IQ Max: ${max.id} — ₹${max.item.amount / 100}/mo`);

  // 2) Create subscription (Razorpay API direct)
  console.log('\n2. Creating test subscription (Razorpay API)...');
  const subscription = await razorpay.subscriptions.create({
    plan_id: planPro,
    customer_notify: 1,
    total_count: 12,
    notes: { test: 'e2e-script' },
  });
  console.log(`   ✓ Subscription created: ${subscription.id}`);
  console.log(`   Status: ${subscription.status}`);
  console.log(`   Short URL: ${subscription.short_url || 'n/a'}`);

  // 3) Test backend create-subscription (needs auth)
  console.log('\n3. Testing backend /api/payment/create-subscription...');
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(supabaseUrl && serviceKey, 'Supabase env required for backend test');

  const supabase = createClient(supabaseUrl, serviceKey);
  const testEmail = `razorpay-e2e-${Date.now()}@test.syntraiq.local`;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: 'TestRazorpayE2E!2026',
    email_confirm: true,
    user_metadata: { name: 'Razorpay E2E Test' },
  });
  if (authError) throw authError;

  const userId = authData.user.id;
  await supabase.from('user_profiles').upsert({
    user_id: userId,
    is_premium: false,
    premium_tier: 'free',
  });

  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: 'TestRazorpayE2E!2026',
  });
  if (signInError) throw signInError;

  const token = signIn.session.access_token;
  const res = await fetch(`${apiBase}/api/payment/create-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan: 'pro', autoRenew: true }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('   ✗ Backend create-subscription failed:', body);
    throw new Error(body.error || 'create-subscription failed');
  }
  console.log(`   ✓ Backend subscription: ${body.subscriptionId}`);
  console.log(`   ✓ Key returned: ${body.keyId}`);
  assert(body.keyId === keyId, 'Backend returned wrong Razorpay key ID');

  // 4) Cancel test subscriptions
  console.log('\n4. Cleaning up test subscriptions...');
  try {
    await razorpay.subscriptions.cancel(subscription.id);
    console.log(`   ✓ Cancelled ${subscription.id}`);
  } catch (e) {
    console.log(`   (skip cancel ${subscription.id}: ${e.message})`);
  }
  try {
    await razorpay.subscriptions.cancel(body.subscriptionId);
    console.log(`   ✓ Cancelled ${body.subscriptionId}`);
  } catch (e) {
    console.log(`   (skip cancel ${body.subscriptionId}: ${e.message})`);
  }

  await supabase.auth.admin.deleteUser(userId);

  console.log('\n=== All automated tests passed ===');
  console.log('\nManual checkout test:');
  console.log(`  Open Razorpay test checkout: ${subscription.short_url || '(use frontend /subscription)'}`);
  console.log('  Test UPI: success@razorpay | Test card: 4111 1111 1111 1111, any future expiry, any CVV');
}

main().catch((err) => {
  console.error('\n❌ E2E test failed:', err.message || err);
  process.exit(1);
});
