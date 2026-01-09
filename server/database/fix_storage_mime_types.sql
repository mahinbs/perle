-- ========================================================================
-- FIX SUPABASE STORAGE BUCKET MIME TYPES
-- ========================================================================
-- Run this in Supabase SQL Editor to fix MIME type restrictions
-- Error: "mime type image/jpeg is not supported"
-- ========================================================================

-- Update generated-images bucket to allow all image types
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml']
WHERE id = 'generated-images';

-- Update generated-videos bucket to allow all video types
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg']
WHERE id = 'generated-videos';

-- Verify the update
SELECT 
  id, 
  name, 
  public, 
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id IN ('generated-images', 'generated-videos');

-- ========================================================================
-- If buckets don't exist, create them
-- ========================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-images',
  'generated-images',
  true,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-videos',
  'generated-videos',
  true,
  52428800,  -- 50MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg'];
