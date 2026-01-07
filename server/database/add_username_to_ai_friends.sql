-- Add username field to ai_friends table
-- This allows users to @mention friends with simple usernames instead of full names

-- Step 1: Add username column (nullable initially)
ALTER TABLE ai_friends 
ADD COLUMN IF NOT EXISTS username TEXT;

-- Step 2: Create unique index on username per user (case-insensitive)
-- Username only needs to be unique within each user's friends, not globally
DROP INDEX IF EXISTS ai_friends_username_unique;
CREATE UNIQUE INDEX IF NOT EXISTS ai_friends_user_username_unique 
ON ai_friends (user_id, LOWER(username));

-- Step 3: Generate usernames for existing friends (if any)
-- Format: lowercase, no spaces, alphanumeric only
DO $$
DECLARE
  friend_record RECORD;
  base_username TEXT;
  final_username TEXT;
  counter INTEGER;
BEGIN
  FOR friend_record IN SELECT id, user_id, name FROM ai_friends WHERE username IS NULL
  LOOP
    -- Generate base username from name
    base_username := LOWER(REGEXP_REPLACE(friend_record.name, '[^a-zA-Z0-9]', '', 'g'));
    
    -- Ensure minimum 3 characters
    IF LENGTH(base_username) < 3 THEN
      base_username := base_username || 'ai';
    END IF;
    
    -- Truncate to 20 characters max
    base_username := SUBSTRING(base_username, 1, 20);
    
    -- Check for duplicates and append number if needed
    final_username := base_username;
    counter := 2;
    
    WHILE EXISTS (
      SELECT 1 FROM ai_friends 
      WHERE user_id = friend_record.user_id 
      AND LOWER(username) = LOWER(final_username)
      AND id != friend_record.id
    ) LOOP
      final_username := SUBSTRING(base_username, 1, 18) || counter::TEXT;
      counter := counter + 1;
      
      -- Safety limit
      IF counter > 100 THEN
        final_username := base_username || SUBSTRING(MD5(friend_record.id::TEXT), 1, 4);
        EXIT;
      END IF;
    END LOOP;
    
    -- Update the friend with generated username
    UPDATE ai_friends SET username = final_username WHERE id = friend_record.id;
  END LOOP;
END $$;

-- Step 4: Add constraint to make username required for new records
ALTER TABLE ai_friends 
ALTER COLUMN username SET NOT NULL;

-- Step 5: Add check constraint (3-20 chars, alphanumeric + underscore)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'username_format'
  ) THEN
    ALTER TABLE ai_friends 
    ADD CONSTRAINT username_format CHECK (
      username ~ '^[a-z0-9_]{3,20}$'
    );
  END IF;
END $$;

-- Note: When creating new AI friends, generate username like this:
-- 1. Take the name, convert to lowercase
-- 2. Remove all non-alphanumeric characters
-- 3. Check if it exists, if yes append a number (username2, username3, etc.)
-- 4. Ensure it's between 3-20 characters

