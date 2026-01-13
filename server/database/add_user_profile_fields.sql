-- Add profile fields to user_profiles table
-- Run this in your Supabase SQL Editor
-- These fields are for edit profile, NOT signup

-- Add display picture URL
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS display_picture_url TEXT;

-- Add personality (e.g., Friendly, Creative, Analytical)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS personality TEXT;

-- Add gender (dropdown: Male, Female, Other, Prefer not to say)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Other', 'Prefer not to say'));

-- Add age (integer)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS age INTEGER CHECK (age IS NULL OR (age > 0 AND age < 150));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Note: These fields are optional and can be NULL
-- Users can update them in the edit profile section
