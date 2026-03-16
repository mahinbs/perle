-- Stores lightweight user memory per AI friend (pronouns, preferred name, key nouns)
CREATE TABLE IF NOT EXISTS ai_friend_user_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_friend_id UUID NOT NULL REFERENCES ai_friends(id) ON DELETE CASCADE,
  preferred_name TEXT,
  pronouns TEXT,
  key_nouns TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, ai_friend_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_friend_user_memory_user_friend
  ON ai_friend_user_memory(user_id, ai_friend_id);

CREATE OR REPLACE FUNCTION update_ai_friend_user_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_friend_user_memory_updated_at_trigger ON ai_friend_user_memory;
CREATE TRIGGER ai_friend_user_memory_updated_at_trigger
BEFORE UPDATE ON ai_friend_user_memory
FOR EACH ROW
EXECUTE FUNCTION update_ai_friend_user_memory_updated_at();

ALTER TABLE ai_friend_user_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai_friend memory" ON ai_friend_user_memory;
CREATE POLICY "Users can view own ai_friend memory"
  ON ai_friend_user_memory FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ai_friend memory" ON ai_friend_user_memory;
CREATE POLICY "Users can insert own ai_friend memory"
  ON ai_friend_user_memory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own ai_friend memory" ON ai_friend_user_memory;
CREATE POLICY "Users can update own ai_friend memory"
  ON ai_friend_user_memory FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own ai_friend memory" ON ai_friend_user_memory;
CREATE POLICY "Users can delete own ai_friend memory"
  ON ai_friend_user_memory FOR DELETE
  USING (auth.uid() = user_id);
