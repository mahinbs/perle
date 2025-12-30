-- Add generated_media table to store user's generated images and videos
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS generated_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  prompt TEXT NOT NULL,
  url TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openai', 'other')),
  width INT NOT NULL,
  height INT NOT NULL,
  aspect_ratio TEXT,
  duration INT, -- For videos (in seconds)
  file_size INT, -- In bytes (optional)
  metadata JSONB DEFAULT '{}', -- Store additional info
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_generated_media_user_id ON generated_media(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_media_type ON generated_media(media_type);
CREATE INDEX IF NOT EXISTS idx_generated_media_created_at ON generated_media(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_media_user_type ON generated_media(user_id, media_type, created_at DESC);

-- RLS Policies (optional - for direct client access)
-- ALTER TABLE generated_media ENABLE ROW LEVEL SECURITY;
-- 
-- CREATE POLICY "Users can view their own generated media"
--   ON generated_media FOR SELECT
--   USING (auth.uid() = user_id);
-- 
-- CREATE POLICY "Users can insert their own generated media"
--   ON generated_media FOR INSERT
--   WITH CHECK (auth.uid() = user_id);
--
-- CREATE POLICY "Users can delete their own generated media"
--   ON generated_media FOR DELETE
--   USING (auth.uid() = user_id);

COMMENT ON TABLE generated_media IS 'Stores user-generated images and videos from AI models';
COMMENT ON COLUMN generated_media.provider IS 'AI provider used: gemini (Imagen/Veo), openai (DALL-E/Sora), other';
COMMENT ON COLUMN generated_media.metadata IS 'Additional info like model name, generation time, etc.';


