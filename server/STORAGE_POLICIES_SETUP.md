# 📋 Storage Policies Setup Guide

## ✅ Bucket Created Successfully!

Your `ai-friend-logos` bucket is created with:
- ✅ Name: `ai-friend-logos`
- ✅ Public: Yes
- ✅ File size limit: 2 MB
- ✅ Allowed MIME types: `image/*`

## 🔐 Now Set Up RLS Policies

Since you can't run SQL directly, create policies via **Supabase Dashboard**:

### Step 1: Go to Storage Policies

1. Open Supabase Dashboard
2. Go to **Storage** → **Policies**
3. Select the **`ai-friend-logos`** bucket from the dropdown

### Step 2: Create 4 Policies

Click **"New Policy"** for each one:

---

#### **Policy 1: Users can upload their own logos**

- **Policy name**: `Users can upload their own logos`
- **Allowed operation**: `INSERT`
- **Target roles**: `authenticated`
- **Policy definition** (paste this):
  ```sql
  bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
  ```

---

#### **Policy 2: Users can read their own logos**

- **Policy name**: `Users can read their own logos`
- **Allowed operation**: `SELECT`
- **Target roles**: `authenticated`
- **Policy definition** (paste this):
  ```sql
  bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
  ```

---

#### **Policy 3: Users can delete their own logos**

- **Policy name**: `Users can delete their own logos`
- **Allowed operation**: `DELETE`
- **Target roles**: `authenticated`
- **Policy definition** (paste this):
  ```sql
  bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
  ```

---

#### **Policy 4: Public can read logos**

- **Policy name**: `Public can read logos`
- **Allowed operation**: `SELECT`
- **Target roles**: `public`
- **Policy definition** (paste this):
  ```sql
  bucket_id = 'ai-friend-logos'
  ```

---

## ✅ Verification

After creating all 4 policies, test the upload:

1. Log in to your app
2. Go to AI Friend page
3. Create a new friend
4. Upload a custom logo
5. It should upload successfully to `ai-friend-logos/{userId}/{timestamp}-{random}.jpg`

## 📁 File Structure

Files will be stored as:
```
ai-friend-logos/
  └── {userId}/
      ├── {timestamp}-{random}.jpg
      ├── {timestamp}-{random}.png
      └── ...
```

Each user's logos are in their own folder for security.


