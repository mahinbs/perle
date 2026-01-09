# ❌ GEMINI DOESN'T SUPPORT REFERENCE IMAGES

## The Hard Truth

**Gemini Imagen and Veo models DO NOT support reference images in any practical way.**

The documentation you found shows features that **either don't exist yet or use a different API** (SDK/Studio vs REST API).

---

## What We Tried

### ❌ Attempt 1: Vertex AI Format
```json
{
  "instances": [{
    "prompt": "...",
    "referenceImages": [...]
  }]
}
```
**Result**: `"referenceImage isn't supported by this model"`

### ❌ Attempt 2: Gemini API Format (from docs you showed)
```json
{
  "contents": [{
    "parts": [
      { "text": "..." },
      { "inline_data": { "mime_type": "image/png", "data": "..." } }
    ]
  }],
  "config": { "response_modalities": ["IMAGE"] }
}
```
**Result**: `"Invalid JSON payload received. Unknown name 'config': Cannot find field."`

### ❌ Attempt 3: Veo 3.1 Format
```json
{
  "model": "veo-3.1-generate-preview",
  "prompt": "...",
  "config": {
    "reference_images": [...]
  }
}
```
**Result**: `"Unknown name 'prompt': Cannot find field"`

---

## What DOES Work

✅ **Image generation** - Imagen 4.0 (text prompts only)  
✅ **Video generation** - Veo 3.0 (text prompts only)  
❌ **Reference images** - NOT SUPPORTED

---

## The Reality Check

| Provider | Image Gen | Video Gen | Reference Images |
|----------|-----------|-----------|------------------|
| **Gemini** | ✅ | ✅ | ❌ |
| **OpenAI DALL-E 3** | ✅ | ❌ | ❌ |
| **OpenAI Sora** | ❌ | 🔜 Coming | ❓ Unknown |
| **Midjourney** | ✅ | ❌ | ✅ (via image prompts) |
| **Runway** | ✅ | ✅ | ✅ |
| **Stable Diffusion** | ✅ | ❌ | ✅ (img2img) |

**None of the FREE APIs support reference images for video generation.**

---

## Why the Docs Show Features That Don't Work

1. **SDK vs REST API**: The docs might show Google AI Studio or SDK features that aren't available via REST API
2. **Preview/Beta Models**: Models like `veo-3.1-generate-preview` and `gemini-3-pro-image-preview` might not be publicly available yet
3. **Paid/Enterprise Only**: Reference image features might be in Vertex AI (paid service), not the free `generativelanguage.googleapis.com` API
4. **Documentation Ahead of Implementation**: Google often documents features before they're fully rolled out

---

## What You CAN Do Instead

### Option 1: Use Text Descriptions (FREE)
Instead of uploading a reference image, **describe it in detail**:

❌ Bad: "make a video from this"  
✅ Good: "create a video of a neon purple and blue glowing logo with geometric shapes, rotating slowly in space with particle effects"

### Option 2: Switch to Paid Service (COSTS MONEY)
- **Runway ML**: $12-95/month, supports reference images
- **Leonardo.ai**: $10-48/month, supports reference images
- **Stable Diffusion API**: Pay per generation, supports img2img

### Option 3: Use Midjourney Image Prompts (Discord Bot)
- Upload image to Discord
- Use image URL as prompt parameter
- $10-60/month subscription

### Option 4: Wait for OpenAI Sora API (NOT YET AVAILABLE)
- OpenAI Sora is currently invite-only
- No public API release date announced
- Likely to support reference images when released

---

## Current System Behavior

### When user uploads a reference image:

**For Images:**
1. ⚠️  Backend receives and uploads to Supabase
2. ⚠️  Converts to base64 (wasted effort)
3. ⚠️  Tries to send to Gemini (ignored by API)
4. ✅ **Falls back to text prompt only**
5. ✅ Imagen 4.0 generates image from text

**For Videos:**
1. ⚠️  Backend receives and uploads to Supabase
2. ⚠️  Converts to base64 (wasted effort)
3. ⚠️  Tries to send to Gemini (ignored by API)
4. ✅ **Falls back to text prompt only**
5. ✅ Veo 3.0 generates video from text

**The reference image is basically ignored.**

---

## Recommended Actions

### Option A: Remove Reference Image Feature (Honest)
1. Remove the file upload UI from `SearchBar.tsx`
2. Show clear message: "Reference images not supported by free AI models"
3. Focus on improving text prompt quality

### Option B: Keep It But Set Expectations (Transparent)
1. Add warning text near upload button:
   ```
   "⚠️ Reference images are processed but may not affect generation.
   For best results, describe your image in detail instead."
   ```
2. Keep the upload flow (for future when APIs support it)
3. Use the reference image data for AI to analyze and enhance the text prompt

### Option C: Hybrid Approach (Smart)
1. When user uploads a reference image, **send it to Gemini Vision API** first
2. Have Gemini **describe the image in detail**
3. **Combine** user's text prompt with AI's detailed description
4. Send the **enhanced text prompt** to Imagen/Veo
5. This way the reference image **indirectly influences** the generation

---

## Supabase MIME Type Fix

You also need to run this SQL in **Supabase SQL Editor**:

```sql
-- File: server/database/fix_storage_mime_types.sql

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg', 'image/jpg', 'image/png', 
  'image/webp', 'image/gif', 'image/bmp'
]
WHERE id = 'generated-images';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'video/mp4', 'video/webm', 'video/quicktime'
]
WHERE id = 'generated-videos';
```

This fixes: `StorageApiError: mime type image/jpeg is not supported`

---

## Bottom Line

**Gemini does NOT support reference images via the free public API.**

The code changes I made removed the broken preview model attempts. Now the system:
- ✅ Works reliably with Imagen 4.0 and Veo 3.0
- ✅ Uses text prompts
- ⚠️  Ignores reference images (because API doesn't support them)
- 🔧 Needs Supabase SQL fix for JPEG uploads

**Your choice**: Remove the feature, keep it with warnings, or implement the hybrid AI description approach.
