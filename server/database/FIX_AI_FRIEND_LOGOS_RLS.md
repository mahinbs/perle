# Fix AI Friend Logos Upload Error

## Problem
Getting error: "Failed to upload logo" with "new row violates row-level security policy"

## Solution: Create RLS Policies via Supabase Dashboard

Since SQL requires owner permissions, create policies via Dashboard:

### Step 1: Go to Storage Policies
1. Open Supabase Dashboard
2. Go to **Storage** → **Policies**
3. Select the **`ai-friend-logos`** bucket from the dropdown

### Step 2: Create 4 Policies

Click **"New Policy"** for each one:

---

#### **Policy 1: Users can upload their own logos**

- **Policy name**: `Users can upload their own logos`
- **Allowed operation**: `INSERT` only
- **Target roles**: `authenticated`
- **Policy definition** (paste this):
  ```sql
  bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
  ```

---

#### **Policy 2: Users can read their own logos**

- **Policy name**: `Users can read their own logos`
- **Allowed operation**: `SELECT` only
- **Target roles**: `authenticated`
- **Policy definition** (paste this):
  ```sql
  bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
  ```

---

#### **Policy 3: Users can delete their own logos**

- **Policy name**: `Users can delete their own logos`
- **Allowed operation**: `DELETE` only
- **Target roles**: `authenticated`
- **Policy definition** (paste this):
  ```sql
  bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
  ```

---

#### **Policy 4: Public can read logos**

- **Policy name**: `Public can read logos`
- **Allowed operation**: `SELECT` only
- **Target roles**: `public` (or leave empty)
- **Policy definition** (paste this):
  ```sql
  bucket_id = 'ai-friend-logos'
  ```

---

## ✅ After Creating All 4 Policies

1. Try uploading the AI friend logo again
2. It should work now!

The policies ensure:
- Users can only upload/delete files in their own folder (`{userId}/filename`)
- Everyone can view logos (public read access)
- Backend can upload using service role key (bypasses RLS)
