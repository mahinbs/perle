-- Supabase Storage RLS Policies for ai-friend-logos bucket
-- 
-- ⚠️ IMPORTANT: This SQL requires OWNER/SUPERUSER permissions
-- If you get "must be owner of table objects" error, use the Dashboard instead:
-- See: server/STORAGE_POLICIES_DASHBOARD_GUIDE.md
--
-- To run this SQL, you need:
-- 1. Owner/superuser access to your Supabase project
-- 2. Or use Supabase Dashboard → Storage → Policies (RECOMMENDED)

-- Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running this script)
DROP POLICY IF EXISTS "Users can upload their own logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own logos" ON storage.objects;
DROP POLICY IF EXISTS "Public can read logos" ON storage.objects;

-- Policy 1: Allow authenticated users to upload their own logos
CREATE POLICY "Users can upload their own logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Allow authenticated users to read their own logos
CREATE POLICY "Users can read their own logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 3: Allow authenticated users to delete their own logos
CREATE POLICY "Users can delete their own logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 4: Allow public read access (for displaying logos in UI)
CREATE POLICY "Public can read logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ai-friend-logos');

-- Add comments for documentation
COMMENT ON POLICY "Users can upload their own logos" ON storage.objects IS 'Allows users to upload logos to their own folder in ai-friend-logos bucket';
COMMENT ON POLICY "Users can read their own logos" ON storage.objects IS 'Allows users to read their own uploaded logos';
COMMENT ON POLICY "Users can delete their own logos" ON storage.objects IS 'Allows users to delete their own uploaded logos';
COMMENT ON POLICY "Public can read logos" ON storage.objects IS 'Allows public read access to all logos for display purposes';

