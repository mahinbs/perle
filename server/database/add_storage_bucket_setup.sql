-- Supabase Storage Bucket Setup for AI Friend Logos
-- IMPORTANT: Storage policies must be created via Supabase Dashboard or Storage API
-- This SQL file provides the policy definitions, but you need to create them manually

-- ============================================
-- OPTION 1: Create via Supabase Dashboard (RECOMMENDED)
-- ============================================
-- 
-- Step 1: Create the bucket
-- 1. Go to Supabase Dashboard → Storage → Buckets
-- 2. Click "New Bucket"
-- 3. Configure:
--    - Name: ai-friend-logos
--    - Public: Yes (checked)
--    - File size limit: 2 MB
--    - Allowed MIME types: image/*
-- 4. Click "Create bucket"
--
-- Step 2: Create RLS Policies (via Dashboard)
-- 1. Go to Storage → Policies → ai-friend-logos bucket
-- 2. Click "New Policy" for each policy below
--
-- Policy 1: "Users can upload their own logos"
--   - Policy name: Users can upload their own logos
--   - Allowed operation: INSERT
--   - Target roles: authenticated
--   - USING expression: (storage.foldername(name))[1] = auth.uid()::text
--   - WITH CHECK expression: bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
--
-- Policy 2: "Users can read their own logos"
--   - Policy name: Users can read their own logos
--   - Allowed operation: SELECT
--   - Target roles: authenticated
--   - USING expression: bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
--
-- Policy 3: "Users can delete their own logos"
--   - Policy name: Users can delete their own logos
--   - Allowed operation: DELETE
--   - Target roles: authenticated
--   - USING expression: bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
--
-- Policy 4: "Public can read logos"
--   - Policy name: Public can read logos
--   - Allowed operation: SELECT
--   - Target roles: public
--   - USING expression: bucket_id = 'ai-friend-logos'

-- ============================================
-- OPTION 2: Create via SQL (Requires superuser/owner access)
-- ============================================
-- If you have owner/superuser access, you can run these SQL commands:

-- Enable RLS on storage.objects (if not already enabled)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload their own logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own logos" ON storage.objects;
DROP POLICY IF EXISTS "Public can read logos" ON storage.objects;

-- Create policies (only works if you have owner permissions)
-- Uncomment these if you have the required permissions:

/*
CREATE POLICY "Users can upload their own logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read their own logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Public can read logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ai-friend-logos');
*/

-- ============================================
-- OPTION 3: Use Supabase Management API (Programmatic)
-- ============================================
-- You can also create policies programmatically using the Supabase Management API
-- or by using the Supabase client with service role key in a Node.js script
