-- Add is_premium field to user_profiles table
-- Run this in your Supabase SQL Editor

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false;

-- Create index for faster premium status queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_premium ON user_profiles(is_premium);

-- Update existing users to be free by default (is_premium = false)
UPDATE user_profiles
  SET is_premium = false
  WHERE is_premium IS NULL;

