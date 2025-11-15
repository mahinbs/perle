-- Add conversation history table for maintaining chat context
-- Run this in your Supabase SQL Editor

-- Conversation history table to store messages for context
CREATE TABLE IF NOT EXISTS conversation_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  answer TEXT NOT NULL,
  mode TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_conversation_history_user_id ON conversation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_history_created_at ON conversation_history(created_at DESC);

-- Add RLS policy (optional - adjust based on your security needs)
-- ALTER TABLE conversation_history ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view their own conversation history"
--   ON conversation_history FOR SELECT
--   USING (auth.uid() = user_id);
-- 
-- CREATE POLICY "Users can insert their own conversation history"
--   ON conversation_history FOR INSERT
--   WITH CHECK (auth.uid() = user_id);

