# 🚨 RUN THIS SQL IN SUPABASE NOW

## Step 1: Open Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" in the left sidebar
4. Click "New Query"

## Step 2: Copy and Run This SQL

```sql
-- Create conversations table for managing multiple chat threads (like ChatGPT)
-- Each user can have multiple conversations, each with its own history

-- Conversations table (stores chat thread metadata)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  chat_mode TEXT NOT NULL DEFAULT 'normal',
  ai_friend_id UUID REFERENCES ai_friends(id) ON DELETE CASCADE,
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add conversation_id to conversation_history table
ALTER TABLE conversation_history 
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_history_conversation_id ON conversation_history(conversation_id);

-- RLS policies for conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
CREATE POLICY "Users can view their own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own conversations" ON conversations;
CREATE POLICY "Users can insert their own conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
CREATE POLICY "Users can update their own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own conversations" ON conversations;
CREATE POLICY "Users can delete their own conversations"
  ON conversations FOR DELETE
  USING (auth.uid() = user_id);

-- Function to auto-update updated_at on conversations
CREATE OR REPLACE FUNCTION update_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_updated_at ON conversations;
CREATE TRIGGER trigger_update_conversation_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_updated_at();

-- Function to generate smart title from first message
CREATE OR REPLACE FUNCTION generate_conversation_title(first_message TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Take first 50 characters of the message as title
  RETURN COALESCE(
    SUBSTRING(first_message FROM 1 FOR 50) || 
    CASE WHEN LENGTH(first_message) > 50 THEN '...' ELSE '' END,
    'New Chat'
  );
END;
$$ LANGUAGE plpgsql;
```

## Step 3: Click "RUN" Button

You should see: ✅ Success. No rows returned

## Step 4: Verify Tables Created

Run this query to verify:

```sql
SELECT COUNT(*) FROM conversations;
```

Should return: `0` (no conversations yet)

---

## ⚠️ IMPORTANT

**DO THIS BEFORE USING THE APP** or you'll get database errors!

Once done, the backend will automatically:
- Create conversations when you send messages
- Link messages to conversations
- Show all your conversations in the sidebar (once frontend is ready)

---

## What This Does

✅ Creates `conversations` table for chat threads  
✅ Links messages to conversations  
✅ Adds indexes for fast queries  
✅ Sets up security policies (RLS)  
✅ Auto-updates timestamps  

---

## After Running SQL

Tell me you've run it, and I'll build the frontend components!
