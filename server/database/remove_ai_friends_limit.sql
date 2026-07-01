-- Remove the 5-character cap on AI friends (app + API no longer enforce this).
DROP TRIGGER IF EXISTS ai_friends_limit_trigger ON ai_friends;
DROP FUNCTION IF EXISTS check_ai_friends_limit();
