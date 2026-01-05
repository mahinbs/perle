-- Create spaces table for user-created custom spaces
CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 100),
  description TEXT NOT NULL CHECK (char_length(description) >= 10 AND char_length(description) <= 1000),
  logo_url TEXT, -- URL to custom logo image (can be default avatar or custom upload)
  is_public BOOLEAN NOT NULL DEFAULT false, -- true = shared with community, false = private
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, title) -- Prevent duplicate titles per user
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_spaces_user_id ON spaces(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spaces_public ON spaces(is_public, created_at DESC) WHERE is_public = true;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_spaces_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spaces_updated_at_trigger
BEFORE UPDATE ON spaces
FOR EACH ROW
EXECUTE FUNCTION update_spaces_updated_at();

-- Add RLS policies
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;

-- Users can view their own spaces
CREATE POLICY "Users can view their own spaces"
  ON spaces FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view public spaces
CREATE POLICY "Users can view public spaces"
  ON spaces FOR SELECT
  USING (is_public = true);

-- Users can insert their own spaces
CREATE POLICY "Users can create their own spaces"
  ON spaces FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own spaces
CREATE POLICY "Users can update their own spaces"
  ON spaces FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own spaces
CREATE POLICY "Users can delete their own spaces"
  ON spaces FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE spaces IS 'Custom spaces created by users. Each space can be private or public (shared with community).';
COMMENT ON COLUMN spaces.title IS 'Title of the space (1-100 characters)';
COMMENT ON COLUMN spaces.description IS 'Description of the space purpose/context (10-1000 characters)';
COMMENT ON COLUMN spaces.logo_url IS 'URL to custom logo image (can be default avatar or custom upload)';
COMMENT ON COLUMN spaces.is_public IS 'If true, space is shared with community. If false, space is private to the creator.';

