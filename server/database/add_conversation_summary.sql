-- Persistent conversation summary (Perplexity-style context compression).
-- `summary` holds a rolling summary of the OLDER messages in the conversation;
-- `summary_message_count` is the number of older messages that summary covers,
-- so we know when it's stale and must be regenerated.
--
-- Run in the Supabase SQL editor. Safe to run more than once. The backend code
-- is graceful: until you run this, summaries are skipped (only the most-recent
-- N verbatim messages are sent — exactly today's behaviour).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary_message_count integer NOT NULL DEFAULT 0;
