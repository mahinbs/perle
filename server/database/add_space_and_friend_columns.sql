-- ========================================================================
-- ADD CHAT HISTORY ISOLATION COLUMNS
-- ========================================================================
-- This migration adds space_id and ai_friend_id columns to enable proper
-- chat history isolation for:
-- 1. Individual AI friend chats (unique per friend)
-- 2. Group AI friend chats (shared across friends)
-- 3. AI psychologist chats (separate from AI friends)
-- 4. Space chats (isolated per space)
-- ========================================================================

-- Step 1: Add space_id column (nullable, for space chat isolation)
ALTER TABLE conversation_history 
ADD COLUMN IF NOT EXISTS space_id UUID;

-- Step 2: Add ai_friend_id column (nullable, for individual friend chat isolation)
ALTER TABLE conversation_history 
ADD COLUMN IF NOT EXISTS ai_friend_id UUID;

-- Step 3: Add indexes for performance (critical for fast history queries)
CREATE INDEX IF NOT EXISTS idx_conversation_history_space_id 
ON conversation_history(space_id);

CREATE INDEX IF NOT EXISTS idx_conversation_history_ai_friend_id 
ON conversation_history(ai_friend_id);

-- Step 4: Add composite indexes for the most common query patterns
CREATE INDEX IF NOT EXISTS idx_conversation_history_user_mode_space 
ON conversation_history(user_id, chat_mode, space_id);

CREATE INDEX IF NOT EXISTS idx_conversation_history_user_mode_friend 
ON conversation_history(user_id, chat_mode, ai_friend_id);

-- Step 5: Add composite index for full isolation query
CREATE INDEX IF NOT EXISTS idx_conversation_history_full_isolation 
ON conversation_history(user_id, chat_mode, ai_friend_id, space_id);

-- ========================================================================
-- CHAT HISTORY ISOLATION LOGIC (How it works):
-- ========================================================================
--
-- 1. INDIVIDUAL AI FRIEND CHAT:
--    - chat_mode = 'ai_friend'
--    - ai_friend_id = specific friend UUID
--    - space_id = NULL
--    Result: Each friend has their own separate history
--
-- 2. GROUP AI FRIEND CHAT:
--    - chat_mode = 'ai_friend'
--    - ai_friend_id = NULL
--    - space_id = NULL
--    Result: Shared history across all friends in group mode
--
-- 3. AI PSYCHOLOGIST CHAT:
--    - chat_mode = 'ai_psychologist'
--    - ai_friend_id = NULL
--    - space_id = NULL
--    Result: Separate from all AI friends and spaces
--
-- 4. SPACE CHAT:
--    - chat_mode = 'space'
--    - space_id = specific space UUID
--    - ai_friend_id = NULL
--    Result: Each space has its own history
--
-- 5. NORMAL CHAT:
--    - chat_mode = 'normal'
--    - ai_friend_id = NULL
--    - space_id = NULL
--    Result: Regular search/answer history
--
-- ========================================================================
-- All histories are ISOLATED PER USER (user_id column)
-- ========================================================================

-- Done! ✅ Chat history is now fully isolated and cached per user per context.

