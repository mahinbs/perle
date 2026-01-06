-- Add custom_greeting field to ai_friends table
ALTER TABLE ai_friends 
ADD COLUMN IF NOT EXISTS custom_greeting TEXT CHECK (char_length(custom_greeting) <= 500);

COMMENT ON COLUMN ai_friends.custom_greeting IS 'Custom greeting message for the AI friend. If set, this will be used instead of the default greeting. Max 500 characters.';

