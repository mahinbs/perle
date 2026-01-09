# ✅ FIXED: Upload Flow for Reference Images

## 🔧 **What Was Wrong Before:**

```typescript
// ❌ OLD (DIRECT BUFFER TO BASE64)
if (req.file) {
  const imageBase64 = req.file.buffer.toString('base64');
  referenceImageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
}
```

**Problem:** Image was NOT uploaded to Supabase, just converted to base64 directly.

---

## ✅ **What's Fixed Now:**

```typescript
// ✅ NEW (UPLOAD TO SUPABASE FIRST, THEN BASE64)
if (req.file && req.userId) {
  // Step 1: Upload to Supabase storage
  const fileName = `reference-images/${req.userId}/${timestamp}.${ext}`;
  await supabase.storage
    .from('generated-images')
    .upload(fileName, req.file.buffer);
  
  // Step 2: Get public URL
  const { data: urlData } = supabase.storage
    .from('generated-images')
    .getPublicUrl(fileName);
  
  // Step 3: Download from Supabase
  const imageResponse = await fetch(urlData.publicUrl);
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  
  // Step 4: Convert to base64
  const imageBase64 = imageBuffer.toString('base64');
  referenceImageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
}
```

---

## 🎯 **Flow for Different Scenarios:**

### **1. Image Generation with Reference Image**
```
User uploads image (📎)
  ↓
Frontend sends FormData with file
  ↓
Backend: Upload to Supabase → Convert to base64
  ↓
Send to Gemini Imagen with reference
  ↓
Generate new image using reference style
  ↓
Save generated image to Supabase
  ↓
Return URL to frontend
```

### **2. Video Generation with Reference Image**
```
User uploads image (📎)
  ↓
Frontend sends FormData with file
  ↓
Backend: Upload to Supabase → Convert to base64
  ↓
Send to Gemini Veo with reference
  ↓
Generate video using reference style
  ↓
Save generated video to Supabase
  ↓
Return URL to frontend
```

### **3. Chat with Image/Document**
```
User attaches image/doc in chat
  ↓
Frontend sends with message
  ↓
Backend: Upload to Supabase → Convert to base64
  ↓
AI reads document/image
  ↓
AI responds based on content
```

---

## 📂 **Supabase Storage Structure:**

```
generated-images/
├── reference-images/
│   ├── {userId}/
│   │   ├── 1234567890-abc123.png  ← Reference images
│   │   └── 1234567891-def456.jpg
│   └── ...
├── {userId}/
│   ├── 1234567892-xyz789.png  ← Generated images
│   └── 1234567893-uvw012.png
└── ...

generated-videos/
├── reference-images/
│   ├── {userId}/
│   │   └── 1234567890-abc123.png  ← Reference images for video
│   └── ...
├── {userId}/
│   ├── 1234567894-mno345.mp4  ← Generated videos
│   └── 1234567895-pqr678.mp4
└── ...
```

---

## 🔒 **RLS Policies (Already Configured):**

```sql
-- Users can upload to their own folder
✅ Allow user uploads to their folder in generated-images
✅ Allow user uploads to their folder in generated-videos

-- Anyone can read (public)
✅ Allow public read for generated-images
✅ Allow public read for generated-videos

-- Users can delete their own files
✅ Allow users to delete their own images
✅ Allow users to delete their own videos
```

---

## 🚀 **Benefits of This Approach:**

1. ✅ **All images stored in Supabase** (not just in memory)
2. ✅ **Consistent upload flow** (reference + generated)
3. ✅ **Easy to track usage** (see what users uploaded)
4. ✅ **Persistent storage** (images don't disappear)
5. ✅ **Fallback handling** (if upload fails, use buffer directly)

---

## 🧪 **Test Now:**

### **Test 1: Image Generation with Reference**
1. Go to Tools → Image
2. Upload a logo image
3. Enter: "Create more logos like this"
4. Click Generate
5. ✅ Should see in Supabase: `generated-images/reference-images/{userId}/...`

### **Test 2: Video Generation with Reference**
1. Go to Tools → Video
2. Upload a sunset image
3. Enter: "Flying through clouds with these colors"
4. Click Generate
5. ✅ Should see in Supabase: `generated-videos/reference-images/{userId}/...`

### **Test 3: Check Supabase Storage**
```bash
# Connect to Supabase
PGPASSWORD='Perle@123perle' psql 'postgresql://postgres:Perle%40123perle@db.doudmnpxdymqyxwufqjo.supabase.co:5432/postgres'

# Check uploaded files
SELECT name, bucket_id, created_at 
FROM storage.objects 
WHERE bucket_id IN ('generated-images', 'generated-videos')
ORDER BY created_at DESC 
LIMIT 10;
```

---

## 🎉 **Server Restarted with New Flow!**

Backend is now:
1. ✅ Uploading reference images to Supabase first
2. ✅ Converting to base64 from Supabase URL
3. ✅ Using proper format for Gemini API
4. ✅ Fallback to direct buffer if upload fails

**Try uploading a reference image now!** 🚀
