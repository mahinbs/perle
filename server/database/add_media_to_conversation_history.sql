-- Add media columns to conversation_history for storing generated images and videos
-- This allows the AI to reference previously generated media when user asks to edit/modify them

-- Add columns for storing generated media URLs
ALTER TABLE conversation_history 
ADD COLUMN IF NOT EXISTS generated_image_url TEXT,
ADD COLUMN IF NOT EXISTS generated_video_url TEXT,
ADD COLUMN IF NOT EXISTS media_prompt TEXT; 

-- Add index for faster media retrieval
CREATE INDEX IF NOT EXISTS idx_conversation_history_user_media 
ON conversation_history(user_id, created_at DESC) 
WHERE generated_image_url IS NOT NULL OR generated_video_url IS NOT NULL;

-- Add comment explaining the purpose
COMMENT ON COLUMN conversation_history.generated_image_url IS 'URL of image generated in this conversation turn (for edit context)';
COMMENT ON COLUMN conversation_history.generated_video_url IS 'URL of video generated in this conversation turn (for edit context)';
COMMENT ON COLUMN conversation_history.media_prompt IS 'Original prompt used to generate the media (for reference)';
