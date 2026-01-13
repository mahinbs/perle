# Profile Pictures Bucket Setup Guide

## Step 1: Create Bucket via Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"** button
4. Fill in the bucket details:
   - **Name**: `profile-pics`
   - **Public bucket**: ✅ **YES** (check this box - important!)
   - **File size limit**: `2097152` (2MB in bytes)
   - **Allowed MIME types**: 
     - `image/jpeg`
     - `image/jpg`
     - `image/png`
     - `image/webp`
     - `image/gif`
5. Click **"Create bucket"**

## Step 2: Run RLS Policies SQL

After creating the bucket, run the SQL script:

```sql
-- Run: server/database/create_profile_pics_bucket.sql
```

This will set up the Row Level Security (RLS) policies so that:
- Users can upload their own profile pictures
- Users can update/delete their own profile pictures
- Everyone can view profile pictures (public access)

## Step 3: Verify Setup

Run this query to verify the bucket was created correctly:

```sql
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'profile-pics';
```

You should see:
- `id`: `profile-pics`
- `public`: `true`
- `file_size_limit`: `2097152`
- `allowed_mime_types`: Array with image types

## Why This Approach?

Supabase storage buckets require admin privileges to create via SQL. The dashboard UI handles this with the proper permissions, so it's the recommended way to create buckets. The SQL script only sets up the security policies.
