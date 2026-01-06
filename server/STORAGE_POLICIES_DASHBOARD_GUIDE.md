# 📋 Create Storage Policies via Supabase Dashboard

Since you don't have SQL owner permissions, create policies through the Dashboard:

## Step-by-Step Instructions

### 1. Navigate to Storage Policies

1. Go to **Supabase Dashboard**
2. Click **Storage** in the left sidebar
3. Click **Policies** tab
4. Select **`ai-friend-logos`** bucket from the dropdown at the top

### 2. Create Policy 1: "Users can upload their own logos"

1. Click **"New Policy"** button
2. Choose **"Create a policy from scratch"**
3. Fill in:
   - **Policy name**: `Users can upload their own logos`
   - **Allowed operation**: `INSERT`
   - **Target roles**: Select `authenticated`
   - **Policy definition**: Paste this:
     ```sql
     bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
     ```
4. Click **"Review"** then **"Save policy"**

---

### 3. Create Policy 2: "Users can read their own logos"

1. Click **"New Policy"** button
2. Choose **"Create a policy from scratch"**
3. Fill in:
   - **Policy name**: `Users can read their own logos`
   - **Allowed operation**: `SELECT`
   - **Target roles**: Select `authenticated`
   - **Policy definition**: Paste this:
     ```sql
     bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
     ```
4. Click **"Review"** then **"Save policy"**

---

### 4. Create Policy 3: "Users can delete their own logos"

1. Click **"New Policy"** button
2. Choose **"Create a policy from scratch"**
3. Fill in:
   - **Policy name**: `Users can delete their own logos`
   - **Allowed operation**: `DELETE`
   - **Target roles**: Select `authenticated`
   - **Policy definition**: Paste this:
     ```sql
     bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
     ```
4. Click **"Review"** then **"Save policy"**

---

### 5. Create Policy 4: "Public can read logos"

1. Click **"New Policy"** button
2. Choose **"Create a policy from scratch"**
3. Fill in:
   - **Policy name**: `Public can read logos`
   - **Allowed operation**: `SELECT`
   - **Target roles**: Select `public`
   - **Policy definition**: Paste this:
     ```sql
     bucket_id = 'ai-friend-logos'
     ```
4. Click **"Review"** then **"Save policy"**

---

## ✅ Verification

After creating all 4 policies, you should see them listed in the Policies tab.

Test the upload:
1. Log in to your app
2. Go to AI Friend page
3. Create/edit a friend
4. Upload a custom logo
5. It should work! 🎉

---

## 📝 Quick Copy-Paste Reference

**Policy 1 (INSERT - authenticated):**
```
bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
```

**Policy 2 (SELECT - authenticated):**
```
bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
```

**Policy 3 (DELETE - authenticated):**
```
bucket_id = 'ai-friend-logos' AND (storage.foldername(name))[1] = auth.uid()::text
```

**Policy 4 (SELECT - public):**
```
bucket_id = 'ai-friend-logos'
```



