-- ========================================================================
-- CREATE STORAGE BUCKETS FOR GENERATED MEDIA
-- ========================================================================
-- Run this in Supabase SQL Editor to create the required buckets
-- ========================================================================

-- Create generated-images bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-images',
  'generated-images',
  true,  -- Public for reading
  10485760,  -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Create generated-videos bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-videos',
  'generated-videos',
  true,  -- Public for reading
  52428800,  -- 50MB limit
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime'];

-- ========================================================================
-- VERIFY BUCKETS CREATED
-- ========================================================================

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('generated-images', 'generated-videos');
