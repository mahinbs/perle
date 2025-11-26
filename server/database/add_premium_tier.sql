-- Add premium_tier field to user_profiles table
-- Run this in your Supabase SQL Editor

-- Add premium_tier column (can be 'free', 'pro', 'max')
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS premium_tier TEXT DEFAULT 'free' CHECK (premium_tier IN ('free', 'pro', 'max'));

-- Migrate existing is_premium boolean to premium_tier
UPDATE user_profiles
  SET premium_tier = CASE 
    WHEN is_premium = true THEN 'pro'
    ELSE 'free'
  END
  WHERE premium_tier IS NULL OR premium_tier = 'free';

-- Add subscription fields for payment tracking
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'cancelled', 'expired', 'paused')),
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;

-- Create index for faster premium tier queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_premium_tier ON user_profiles(premium_tier);
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_status ON user_profiles(subscription_status);

-- Keep is_premium for backward compatibility (will be computed from premium_tier)
-- You can remove this later if not needed

