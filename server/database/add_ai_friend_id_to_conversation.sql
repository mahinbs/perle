-- Add ai_friend_id column to conversation_history to track which AI friend the conversation belongs to
ALTER TABLE conversation_history 
ADD COLUMN IF NOT EXISTS ai_friend_id UUID REFERENCES ai_friends(id) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_conversation_history_ai_friend_id 
ON conversation_history(ai_friend_id, created_at DESC);

-- Update existing RLS policies if needed (conversation_history should already have RLS enabled)
-- The existing policies should work, but we may want to ensure ai_friend_id is properly handled

COMMENT ON COLUMN conversation_history.ai_friend_id IS 'ID of the AI friend this conversation belongs to. NULL for non-AI-friend conversations or group chats.';

