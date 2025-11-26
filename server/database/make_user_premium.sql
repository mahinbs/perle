-- Make a user premium (for testing/admin purposes)
-- Replace 'USER_EMAIL_HERE' with the actual user email

-- Option 1: Make user IQ Pro (₹399/month)
UPDATE user_profiles
SET 
  premium_tier = 'pro',
  is_premium = true,
  subscription_status = 'active',
  subscription_start_date = NOW(),
  subscription_end_date = NOW() + INTERVAL '1 month',
  auto_renew = true,
  updated_at = NOW()
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'animeshbms@gmail.com'
);

-- Option 2: Make user IQ Max (₹899/month) - Uncomment to use instead
-- UPDATE user_profiles
-- SET 
--   premium_tier = 'max',
--   is_premium = true,
--   subscription_status = 'active',
--   subscription_start_date = NOW(),
--   subscription_end_date = NOW() + INTERVAL '1 month',
--   auto_renew = true,
--   updated_at = NOW()
-- WHERE user_id = (
--   SELECT id FROM auth.users WHERE email = 'animeshbms@gmail.com'
-- );

-- Verify the update
SELECT 
  u.email,
  up.premium_tier,
  up.is_premium,
  up.subscription_status,
  up.subscription_start_date,
  up.subscription_end_date
FROM user_profiles up
JOIN auth.users u ON u.id = up.user_id
WHERE u.email = 'animeshbms@gmail.com';

