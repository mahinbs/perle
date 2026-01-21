-- Add space_files table for file uploads in spaces
-- Files are shared with anyone who has access to the space

CREATE TABLE IF NOT EXISTS space_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL, -- MIME type (e.g., 'application/pdf', 'image/jpeg')
  file_size BIGINT NOT NULL, -- Size in bytes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_space_files_space_id ON space_files(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_space_files_user_id ON space_files(user_id, created_at DESC);

-- Add RLS policies
ALTER TABLE space_files ENABLE ROW LEVEL SECURITY;

-- Users can view files in their own spaces
CREATE POLICY "Users can view files in their own spaces"
  ON space_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM spaces 
      WHERE spaces.id = space_files.space_id 
      AND spaces.user_id = auth.uid()
    )
  );

-- Users can view files in public spaces
CREATE POLICY "Users can view files in public spaces"
  ON space_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM spaces 
      WHERE spaces.id = space_files.space_id 
      AND spaces.is_public = true
    )
  );

-- Users can upload files to their own spaces
CREATE POLICY "Users can upload files to their own spaces"
  ON space_files FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM spaces 
      WHERE spaces.id = space_files.space_id 
      AND spaces.user_id = auth.uid()
    )
  );

-- Users can delete files from their own spaces
CREATE POLICY "Users can delete files from their own spaces"
  ON space_files FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM spaces 
      WHERE spaces.id = space_files.space_id 
      AND spaces.user_id = auth.uid()
    )
  );
