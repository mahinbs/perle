-- Make a user premium (manual admin grant)
-- Run in Supabase SQL Editor. Replace the email below.

-- STEP 1: Diagnose — check if unpaid Razorpay fields will block premium on login
SELECT
  u.email,
  up.premium_tier,
  up.is_premium,
  up.subscription_status,
  up.subscription_start_date,
  up.subscription_end_date,
  up.razorpay_subscription_id,
  up.razorpay_plan_id,
  up.razorpay_payment_id,
  up.subscription_id
FROM user_profiles up
JOIN auth.users u ON u.id = up.user_id
WHERE u.email = 'animeshbms@gmail.com';

-- If razorpay_subscription_id or razorpay_plan_id is set BUT razorpay_payment_id is NULL,
-- the backend revokes premium on login even after this UPDATE. You MUST clear Razorpay fields
-- (or set razorpay_payment_id) — see STEP 2.

-- STEP 2: Grant IQ Max (₹899/month tier)
UPDATE user_profiles
SET
  premium_tier = 'max',
  is_premium = true,
  subscription_status = 'active',
  subscription_start_date = NOW(),
  subscription_end_date = NOW() + INTERVAL '12 months',
  subscription_id = 'manual_admin_grant',
  auto_renew = false,
  free_search_used = 0,
  free_deep_used = 0,
  -- Clear unpaid Razorpay checkout leftovers (required for manual grants)
  razorpay_subscription_id = NULL,
  razorpay_plan_id = NULL,
  razorpay_order_id = NULL,
  razorpay_payment_id = NULL,
  updated_at = NOW()
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'animeshbms@gmail.com'
);

-- STEP 3: Verify
SELECT
  u.email,
  up.premium_tier,
  up.is_premium,
  up.subscription_status,
  up.subscription_start_date,
  up.subscription_end_date,
  up.razorpay_subscription_id,
  up.razorpay_payment_id,
  up.subscription_id
FROM user_profiles up
JOIN auth.users u ON u.id = up.user_id
WHERE u.email = 'animeshbms@gmail.com';

-- After running: user must log out and log back in (or hard refresh) on app + website.
