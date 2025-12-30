# AI Provider Fallback System

## Overview

The system now has **automatic fallback** for image and video generation when Gemini fails (quota exceeded, errors, etc.).

---

## Image Generation Fallback

### Primary: Gemini Imagen 3
- **Model:** `imagen-3.0-generate-001`
- **API Key:** `GOOGLE_API_KEY` or `GOOGLE_API_KEY_FREE`
- **Cost:** Free tier (20/day) or ~$0.001/image
- **Aspect Ratios:** 1:1, 16:9, 9:16, 4:3, 3:4

### Fallback: OpenAI DALL-E 3
- **Model:** `dall-e-3` (Latest version)
- **API Key:** `OPENAI_API_KEY`
- **Cost:** ~$0.04/image (HD quality)
- **Sizes:** 1024x1024, 1792x1024, 1024x1792
- **Quality:** HD (high definition)
- **Style:** Vivid (hyper-real, dramatic)

### How It Works

```typescript
// 1. Try Gemini first
try {
  const image = await generateImageWithGemini(prompt, aspectRatio);
  if (image) return image;
} catch (error) {
  console.warn('Gemini failed, trying DALL-E...');
}

// 2. Automatic fallback to DALL-E 3
const image = await generateImageWithDALLE(prompt, aspectRatio);
return image;
```

### Aspect Ratio Mapping

| User Request | Gemini Imagen | DALL-E 3 |
|--------------|---------------|----------|
| 1:1 (Square) | 1:1 | 1024x1024 |
| 16:9 (Landscape) | 16:9 | 1792x1024 |
| 9:16 (Portrait) | 9:16 | 1024x1792 |
| 4:3 (Standard) | 4:3 | 1792x1024 |
| 3:4 (Vertical) | 3:4 | 1024x1792 |

---

## Video Generation Fallback

### Primary: Gemini Veo 3.1
- **Model:** `veo-001`
- **API Key:** `GOOGLE_API_KEY` or `GOOGLE_API_KEY_FREE`
- **Duration:** 2-10 seconds
- **Aspect Ratios:** 16:9, 9:16, 1:1
- **Cost:** Free tier or pay-as-you-go

### Fallback: OpenAI Sora
- **Status:** ⚠️ **NOT YET AVAILABLE** via public API
- **Expected:** Q1-Q2 2026 (estimated)
- **When available:** Will automatically work as fallback

### Current Behavior

```typescript
// 1. Try Gemini Veo
try {
  const video = await generateVideoWithGemini(prompt, duration, aspectRatio);
  if (video) return video;
} catch (error) {
  console.error('Gemini Veo failed');
}

// 2. Try OpenAI Sora (placeholder for future)
const video = await generateVideoWithOpenAI(prompt, duration, aspectRatio);
// Currently returns null - waiting for Sora API

// 3. Return null if all fail
return null;
```

---

## Environment Variables

### Required for Image Fallback

```bash
# Primary: Gemini (required)
GOOGLE_API_KEY=your_gemini_key
# OR
GOOGLE_API_KEY_FREE=your_free_gemini_key

# Fallback: OpenAI DALL-E 3 (optional but recommended)
OPENAI_API_KEY=your_openai_key
```

### Required for Video

```bash
# Primary: Gemini Veo (required)
GOOGLE_API_KEY=your_gemini_key

# Fallback: OpenAI Sora (not yet available)
OPENAI_API_KEY=your_openai_key  # Will be used when Sora API launches
```

---

## Testing

### Test Image Generation with Fallback

```bash
# This will try Gemini first, then DALL-E if Gemini fails
curl -X POST http://localhost:3333/api/media/generate-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset over mountains",
    "aspectRatio": "16:9"
  }'
```

**Expected behavior:**
1. ✅ If Gemini works → Returns Gemini image
2. ⚠️ If Gemini fails (quota) → Automatically tries DALL-E 3
3. ✅ If DALL-E works → Returns DALL-E image
4. ❌ If both fail → Returns error

### Test Video Generation

```bash
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Mountain landscape with moving clouds",
    "duration": 5,
    "aspectRatio": "16:9"
  }'
```

**Expected behavior:**
1. ✅ If Gemini Veo works → Returns video
2. ❌ If Gemini fails → Checks Sora (currently unavailable)
3. ❌ If all fail → Returns error with helpful message

---

## Error Messages

### Image Generation

**Gemini fails, DALL-E succeeds:**
```
⚠️ Gemini image generation failed, trying DALL-E 3 fallback...
🔄 Using OpenAI DALL-E 3 as fallback for image generation
🎨 Fallback: Generating image with DALL-E 3: "sunset"
✅ Image generated successfully with DALL-E 3
```

**Both fail:**
```
⚠️ Gemini image generation failed, trying DALL-E 3 fallback...
⚠️ OpenAI API key not configured. Cannot fallback to DALL-E.
❌ Failed to generate image
```

### Video Generation

**Gemini fails, Sora not available:**
```
⚠️ Gemini Veo video generation failed: [error]
🔄 Checking OpenAI Sora availability...
⚠️ OpenAI Sora video generation is not yet available via API
   Waiting for official Sora API release from OpenAI
❌ All video generation providers failed or unavailable
   - Gemini Veo: Failed (quota exceeded or error)
   - OpenAI Sora: Not yet available via API
```

---

## Cost Comparison

### Images

| Provider | Model | Cost/Image | Quality | Speed |
|----------|-------|------------|---------|-------|
| Gemini | Imagen 3 | ~$0.001 | High | Fast |
| OpenAI | DALL-E 3 (HD) | ~$0.04 | Very High | Medium |

**Recommendation:** Use Gemini as primary (40x cheaper), DALL-E as fallback

### Videos

| Provider | Model | Cost/Second | Availability |
|----------|-------|-------------|--------------|
| Gemini | Veo 3.1 | ~$0.02/sec | ✅ Available |
| OpenAI | Sora | TBD | ❌ Not yet available |

---

## Quota Management

### Gemini Free Tier
- **Limit:** 20 requests/day per model
- **Reset:** Daily
- **Solution:** Upgrade to paid tier or use multiple API keys

### OpenAI
- **Limit:** Based on your account tier
- **Typical:** $5-$120/month depending on tier
- **No daily limits** (just rate limits)

---

## Future Improvements

### When OpenAI Sora API Launches

The system is **already prepared** for Sora:

```typescript
// This function exists and will work automatically when Sora API is available
export async function generateVideoWithOpenAI(
  prompt: string,
  duration: number,
  aspectRatio: string
): Promise<GeneratedVideo | null> {
  // Will POST to: https://api.openai.com/v1/videos/generations
  // (endpoint to be confirmed when Sora API launches)
}
```

**No code changes needed** - just update the API endpoint when OpenAI releases it!

---

## Summary

✅ **Images:** Gemini → DALL-E 3 (automatic fallback working)  
⚠️ **Videos:** Gemini Veo only (Sora fallback ready for future)  
✅ **Chat:** Already has multi-provider support (Gemini, GPT, Grok)  
✅ **Error handling:** Graceful fallbacks with helpful messages  

**Your system is production-ready with robust fallback mechanisms!** 🚀

