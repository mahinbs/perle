# 🔧 Fix Supabase Storage RLS Policy Error

## ❌ The Error You're Getting:

```
Supabase upload error: StorageApiError: new row violates row-level security policy
status: 400, statusCode: '403'
```

This happens because **Supabase Storage RLS (Row Level Security)** is blocking your backend from uploading files.

---

## ✅ The Fix (Run This SQL):

### Step 1: Go to Supabase Dashboard
1. Open your Supabase project
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Copy & Paste This SQL

```sql
-- Drop existing policies (clean slate)
DROP POLICY IF EXISTS "Allow authenticated uploads to generated-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to generated-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read for generated-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read for generated-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow user uploads to their folder in generated-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow user uploads to their folder in generated-videos" ON storage.objects;

-- Allow users to upload to their own folder in generated-images
CREATE POLICY "Allow user uploads to their folder in generated-images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to upload to their own folder in generated-videos
CREATE POLICY "Allow user uploads to their folder in generated-videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

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

-- Make buckets public for reading
UPDATE storage.buckets SET public = true WHERE id = 'generated-images';
UPDATE storage.buckets SET public = true WHERE id = 'generated-videos';
```

### Step 3: Click **RUN** (or press Cmd+Enter / Ctrl+Enter)

---

## 🎯 What This Does:

1. ✅ **Allows Backend to Upload**: Your backend (using service role) can upload files
2. ✅ **User Folder Isolation**: Each user can only upload to their own folder (`userId/filename.mp4`)
3. ✅ **Public Read Access**: Anyone can view/download the files (needed for frontend)
4. ✅ **Prevents Overwrites**: Files cannot be accidentally overwritten

---

## 🔍 Why This Error Happened:

Your backend is authenticated with a **service role key** (from `.env`), but Supabase Storage has **strict RLS policies** by default that block even service role uploads unless explicitly allowed.

The fix creates policies that:
- Allow authenticated users (including service role) to upload to `generated-images` and `generated-videos`
- Allow public read access so the frontend can display the media
- Enforce user folder isolation for security

---

## 🧪 Test After Running SQL:

1. **Generate a video** in your app
2. Check the backend logs - should see:
   ```
   ✅ Video uploaded to Supabase: 6.49MB
   ✅ Video saved to database
   ```
3. **Check the gallery** - video should load and play!

---

## 🚨 If Still Not Working:

### Check 1: Verify Buckets Exist
```sql
SELECT id, name, public FROM storage.buckets;
```
Should show:
- `generated-images` (public = true)
- `generated-videos` (public = true)

### Check 2: Verify Policies Are Active
```sql
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage';
```
Should show all 4 policies (2 INSERT, 2 SELECT)

### Check 3: Create Buckets if Missing
```sql
-- Create generated-images bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-images', 'generated-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create generated-videos bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-videos', 'generated-videos', true)
ON CONFLICT (id) DO NOTHING;
```

---

## 📝 Environment Variables

Make sure your `.env` has:

```bash
# Supabase (use service role for backend uploads)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhb... (not the anon key!)

# Gemini API (use FREE key first)
GEMINI_API_KEY_FREE=AIzaSy...
```

⚠️ **IMPORTANT**: Backend must use **service role key**, NOT anon key!

---

## ✅ Summary

Run the SQL above in Supabase SQL Editor, and your video/image uploads will work perfectly! 🎉

