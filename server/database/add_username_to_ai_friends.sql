-- Add username field to ai_friends table
-- This allows users to @mention friends with simple usernames instead of full names

-- Step 1: Add username column (nullable initially)
ALTER TABLE ai_friends 
ADD COLUMN IF NOT EXISTS username TEXT;

-- Step 2: Create unique index on username (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS ai_friends_username_unique 
ON ai_friends (LOWER(username));

-- Step 3: Generate usernames for existing friends (if any)
-- Format: lowercase, no spaces, alphanumeric only
UPDATE ai_friends 
SET username = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'))
WHERE username IS NULL;

-- Step 4: Handle duplicates by appending user_id
UPDATE ai_friends 
SET username = username || '_' || SUBSTRING(id::text, 1, 8)
WHERE username IN (
  SELECT username 
  FROM ai_friends 
  WHERE username IS NOT NULL
  GROUP BY username 
  HAVING COUNT(*) > 1
);

-- Step 5: Add constraint to make username required for new records
ALTER TABLE ai_friends 
ALTER COLUMN username SET NOT NULL;

-- Step 6: Add check constraint (3-20 chars, alphanumeric + underscore)
ALTER TABLE ai_friends 
ADD CONSTRAINT username_format CHECK (
  username ~ '^[a-z0-9_]{3,20}$'
);

-- Note: When creating new AI friends, generate username like this:
-- 1. Take the name, convert to lowercase
-- 2. Remove all non-alphanumeric characters
-- 3. Check if it exists, if yes append a number (username2, username3, etc.)
-- 4. Ensure it's between 3-20 characters

