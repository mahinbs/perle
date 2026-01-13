-- ========================================================================
-- CREATE PROFILE-PICS STORAGE BUCKET
-- ========================================================================
-- IMPORTANT: Bucket creation must be done via Supabase Dashboard
-- ========================================================================
-- 
-- STEP 1: Create the bucket via Supabase Dashboard:
--   1. Go to Storage in your Supabase Dashboard
--   2. Click "New bucket"
--   3. Name: "profile-pics"
--   4. Public bucket: YES (checked)
--   5. File size limit: 2097152 (2MB)
--   6. Allowed MIME types: image/jpeg, image/jpg, image/png, image/webp, image/gif
--   7. Click "Create bucket"
--
-- STEP 2: Run this SQL script to set up RLS policies
-- ========================================================================

-- Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can upload own profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Profile pictures are public" ON storage.objects;

-- RLS Policy: Users can upload their own profile pictures
-- File path format: {userId}/{filename}
CREATE POLICY "Users can upload own profile pictures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-pics' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS Policy: Users can update their own profile pictures
CREATE POLICY "Users can update own profile pictures"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-pics' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS Policy: Users can delete their own profile pictures
CREATE POLICY "Users can delete own profile pictures"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-pics' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS Policy: Everyone can view profile pictures (public bucket)
CREATE POLICY "Profile pictures are public"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-pics');

-- ========================================================================
-- ✅ DONE! Verify the bucket exists:
-- ========================================================================
-- SELECT id, name, public, file_size_limit, allowed_mime_types
-- FROM storage.buckets
-- WHERE id = 'profile-pics';
