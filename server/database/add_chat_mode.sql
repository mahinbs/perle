-- Add chat_mode field to conversation_history table
-- This enables separate chat histories for different interaction modes:
-- 'normal': Regular chat with citations, points, images and reference links (like Perplexity)
-- 'ai_friend': Casual conversation mode where AI talks like a real human friend
-- 'ai_psychologist': Professional support mode where AI talks like a psychologist

-- Add chat_mode column with default 'normal'
ALTER TABLE conversation_history 
ADD COLUMN IF NOT EXISTS chat_mode TEXT NOT NULL DEFAULT 'normal';

-- Create index for faster queries by chat_mode
CREATE INDEX IF NOT EXISTS idx_conversation_history_chat_mode ON conversation_history(user_id, chat_mode, created_at DESC);

-- Update existing records to have 'normal' mode (if any exist without the field)
UPDATE conversation_history 
SET chat_mode = 'normal' 
WHERE chat_mode IS NULL OR chat_mode = '';

COMMENT ON COLUMN conversation_history.chat_mode IS 'Chat mode: normal (search/citations), ai_friend (casual chat), ai_psychologist (support)';

