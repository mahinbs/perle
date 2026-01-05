# Supabase Storage Bucket Setup for AI Friend Logos

## 📦 Bucket Configuration

### 1. Create Storage Bucket in Supabase

1. Go to your Supabase Dashboard
2. Navigate to **Storage** → **Buckets**
3. Click **New Bucket**
4. Configure as follows:
   - **Name**: `ai-friend-logos`
   - **Public**: ✅ **Yes** (so logos can be accessed via public URLs)
   - **File size limit**: 2 MB
   - **Allowed MIME types**: `image/*`

### 2. Set Up RLS Policies

Run this SQL in your Supabase SQL Editor:

```sql
-- Allow authenticated users to upload their own logos
CREATE POLICY "Users can upload their own logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read their own logos
CREATE POLICY "Users can read their own logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own logos
CREATE POLICY "Users can delete their own logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ai-friend-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access (for displaying logos)
CREATE POLICY "Public can read logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ai-friend-logos');
```

### 3. Install Multer Package

```bash
cd server
npm install multer
npm install --save-dev @types/multer
```

---

## 🎨 Default Logo Options

The system includes **6 default avatar logos** that users can choose from:

1. **Avatar 1** - Gold background (`#C7A869`)
2. **Avatar 2** - Green background (`#10A37F`)
3. **Avatar 3** - Indigo background (`#6366F1`)
4. **Avatar 4** - Pink background (`#EC4899`)
5. **Avatar 5** - Amber background (`#F59E0B`)
6. **Avatar 6** - Purple background (`#8B5CF6`)

These are generated using UI Avatars API and don't require storage.

---

## 📡 API Endpoints

### Get Default Logos
```
GET /api/ai-friends/default-logos
```

**Response:**
```json
{
  "logos": [
    {
      "id": "avatar-1",
      "name": "Avatar 1",
      "url": "https://ui-avatars.com/api/..."
    },
    ...
  ]
}
```

### Upload Custom Logo
```
POST /api/ai-friends/upload-logo
Content-Type: multipart/form-data

Body: { logo: File }
```

**Response:**
```json
{
  "url": "https://[supabase-url]/storage/v1/object/public/ai-friend-logos/[path]",
  "path": "ai-friend-logos/[userId]/[timestamp]-[random].jpg"
}
```

---

## 🔧 Usage in Frontend

1. **Show default logos** - Fetch from `/api/ai-friends/default-logos`
2. **Upload custom logo** - POST to `/api/ai-friends/upload-logo` with FormData
3. **Create/Update friend** - Use `defaultLogo` (e.g., "avatar-1") or `logoUrl` (custom upload URL)

---

## ✅ Verification

After setup, test the upload endpoint:

```bash
curl -X POST http://localhost:3333/api/ai-friends/upload-logo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "logo=@/path/to/image.jpg"
```

You should receive a public URL that you can use for the AI friend logo.

