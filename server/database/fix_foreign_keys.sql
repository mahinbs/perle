-- Fix Foreign Key Constraints for Supabase Auth
-- Run this in your Supabase SQL Editor
-- This updates all foreign keys to reference auth.users instead of the custom users table

-- Drop old foreign key constraints
ALTER TABLE user_profiles 
  DROP CONSTRAINT IF EXISTS user_profiles_user_id_fkey;

ALTER TABLE search_history 
  DROP CONSTRAINT IF EXISTS search_history_user_id_fkey;

ALTER TABLE library_items 
  DROP CONSTRAINT IF EXISTS library_items_user_id_fkey;

ALTER TABLE sessions 
  DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;

-- Add new foreign key constraints pointing to auth.users
ALTER TABLE user_profiles 
  ADD CONSTRAINT user_profiles_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE search_history 
  ADD CONSTRAINT search_history_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE library_items 
  ADD CONSTRAINT library_items_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE sessions 
  ADD CONSTRAINT sessions_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Optional: Drop the unused custom users table if you're not using it
-- Uncomment the line below if you want to remove it:
-- DROP TABLE IF EXISTS users CASCADE;

-- Verify the constraints were created
SELECT 
  tc.table_name, 
  tc.constraint_name, 
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name IN ('user_profiles', 'search_history', 'library_items', 'sessions')
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, tc.constraint_name;

