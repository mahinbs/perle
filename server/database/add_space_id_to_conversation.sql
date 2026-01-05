-- Add space_id field to conversation_history table for space-specific conversations
ALTER TABLE conversation_history 
ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES spaces(id) ON DELETE CASCADE;

-- Create index for faster queries by space
CREATE INDEX IF NOT EXISTS idx_conversation_history_space_id ON conversation_history(user_id, space_id, chat_mode, created_at DESC);

-- Update existing records to have NULL space_id (they're not in a space)
UPDATE conversation_history 
SET space_id = NULL 
WHERE space_id IS NULL;

COMMENT ON COLUMN conversation_history.space_id IS 'Optional space ID - if set, conversation is isolated to this specific space. NULL means normal conversation.';

