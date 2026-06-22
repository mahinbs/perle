-- Server-side free-tier usage counters (lifetime) on user_profiles.
-- Run this in the Supabase SQL editor. Safe to run more than once.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS free_search_used integer NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS free_deep_used   integer NOT NULL DEFAULT 0;

-- Atomic increment helpers (avoid read-then-write races under load).
CREATE OR REPLACE FUNCTION increment_free_search_used(p_user_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE user_profiles SET free_search_used = COALESCE(free_search_used, 0) + 1
  WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION increment_free_deep_used(p_user_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE user_profiles SET free_deep_used = COALESCE(free_deep_used, 0) + 1
  WHERE user_id = p_user_id;
$$;
