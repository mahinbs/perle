-- Supabase Storage Bucket Setup for AI Friend Logos
-- This SQL file helps set up RLS policies for the storage bucket
-- Note: You still need to create the bucket manually in Supabase Dashboard

-- Step 1: Create the bucket in Supabase Dashboard
-- Go to Storage → Buckets → New Bucket
-- Name: ai-friend-logos
-- Public: Yes
-- File size limit: 2 MB
-- Allowed MIME types: image/*

-- Step 2: Run these RLS policies

-- Allow authenticated users to upload their own logos
CREATE POLICY IF NOT EXISTS "Users can upload their own logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read their own logos
CREATE POLICY IF NOT EXISTS "Users can read their own logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own logos
CREATE POLICY IF NOT EXISTS "Users can delete their own logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access (for displaying logos in UI)
CREATE POLICY IF NOT EXISTS "Public can read logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ai-friend-logos');

COMMENT ON POLICY "Users can upload their own logos" ON storage.objects IS 'Allows users to upload logos to their own folder in ai-friend-logos bucket';
COMMENT ON POLICY "Users can read their own logos" ON storage.objects IS 'Allows users to read their own uploaded logos';
COMMENT ON POLICY "Users can delete their own logos" ON storage.objects IS 'Allows users to delete their own uploaded logos';
COMMENT ON POLICY "Public can read logos" ON storage.objects IS 'Allows public read access to all logos for display purposes';

