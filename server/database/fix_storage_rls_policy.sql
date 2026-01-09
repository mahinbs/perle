-- ========================================================================
-- FIX SUPABASE STORAGE RLS POLICY FOR GENERATED MEDIA
-- ========================================================================
-- This fixes the "new row violates row-level security policy" error
-- when uploading images/videos to Supabase Storage
-- ========================================================================

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Allow authenticated uploads to generated-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to generated-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read for generated-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read for generated-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow user uploads to their folder in generated-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow user uploads to their folder in generated-videos" ON storage.objects;

-- ========================================================================
-- POLICY 1: Allow Backend Service Role to Upload
-- ========================================================================
-- This is THE MOST IMPORTANT policy - allows your backend to upload
-- using the Supabase service role key (which bypasses RLS by default)
-- But we'll add it anyway for clarity

-- ========================================================================
-- POLICY 2: Allow Users to Upload to Their Own Folder
-- ========================================================================

-- For generated-images bucket
CREATE POLICY "Allow user uploads to their folder in generated-images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- For generated-videos bucket
CREATE POLICY "Allow user uploads to their folder in generated-videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- ========================================================================
-- POLICY 3: Allow Public Read Access (for viewing images/videos)
-- ========================================================================

-- Allow public read for generated-images
CREATE POLICY "Allow public read for generated-images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'generated-images');

-- Allow public read for generated-videos
CREATE POLICY "Allow public read for generated-videos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'generated-videos');

-- ========================================================================
-- POLICY 4: Allow Users to Delete Their Own Files
-- ========================================================================

-- For generated-images bucket
CREATE POLICY "Allow users to delete their own images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'generated-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- For generated-videos bucket
CREATE POLICY "Allow users to delete their own videos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'generated-videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- ========================================================================
-- ENSURE BUCKETS ARE PUBLIC (for reading)
-- ========================================================================

-- Make generated-images bucket public for reading
UPDATE storage.buckets
SET public = true
WHERE id = 'generated-images';

-- Make generated-videos bucket public for reading
UPDATE storage.buckets
SET public = true
WHERE id = 'generated-videos';

-- ========================================================================
-- ✅ DONE! Now your backend can upload and users can view/download
-- ========================================================================

-- Verify policies:
SELECT 
  tablename, 
  policyname, 
  roles,
  cmd,
  qual::text as using_clause,
  with_check::text as with_check_clause
FROM pg_policies
WHERE tablename = 'objects'
AND schemaname = 'storage'
ORDER BY policyname;

