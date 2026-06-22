-- Pin conversations to the top of the sidebar (Perplexity-style).
-- `is_pinned` is the truth bit; `pinned_at` lets us order pinned items by
-- "most recently pinned first" if a user has several.
--
-- Safe to run more than once. Code is graceful: until these columns exist,
-- the conversations endpoint just orders by updated_at as before.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

-- Index for the common query (sidebar list ordered by pin + recency).
CREATE INDEX IF NOT EXISTS conversations_user_chatmode_pin_idx
  ON conversations (user_id, chat_mode, is_pinned DESC, pinned_at DESC, updated_at DESC);
