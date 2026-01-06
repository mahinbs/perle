-- Create ai_friends table for custom AI friends
CREATE TABLE IF NOT EXISTS ai_friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 50),
  description TEXT NOT NULL CHECK (char_length(description) >= 10 AND char_length(description) <= 500),
  logo_url TEXT, -- URL to custom logo image (can be base64 data URL or external URL)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name) -- Prevent duplicate names per user
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ai_friends_user_id ON ai_friends(user_id, created_at DESC);

-- Add constraint to limit 4 friends per user
CREATE OR REPLACE FUNCTION check_ai_friends_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM ai_friends WHERE user_id = NEW.user_id) >= 4 THEN
    RAISE EXCEPTION 'Maximum of 4 AI friends allowed per user';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_friends_limit_trigger
BEFORE INSERT ON ai_friends
FOR EACH ROW
EXECUTE FUNCTION check_ai_friends_limit();

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_ai_friends_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_friends_updated_at_trigger
BEFORE UPDATE ON ai_friends
FOR EACH ROW
EXECUTE FUNCTION update_ai_friends_updated_at();

-- Add RLS policies
ALTER TABLE ai_friends ENABLE ROW LEVEL SECURITY;

-- Users can only see their own friends
CREATE POLICY "Users can view their own AI friends"
  ON ai_friends FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own friends
CREATE POLICY "Users can create their own AI friends"
  ON ai_friends FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own friends
CREATE POLICY "Users can update their own AI friends"
  ON ai_friends FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own friends
CREATE POLICY "Users can delete their own AI friends"
  ON ai_friends FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE ai_friends IS 'Custom AI friends created by users. Each user can have up to 4 friends with custom names, descriptions, and logos.';
COMMENT ON COLUMN ai_friends.name IS 'Custom name for the AI friend (1-50 characters)';
COMMENT ON COLUMN ai_friends.description IS 'Description of the AI friend personality/behavior (10-500 characters)';
COMMENT ON COLUMN ai_friends.logo_url IS 'URL to custom logo image (can be base64 data URL or external URL)';



