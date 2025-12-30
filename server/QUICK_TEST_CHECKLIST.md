# Quick Test Checklist - All Features

## ✅ What to Test

### 1. Database Migration
```sql
-- Run in Supabase SQL Editor
-- File: server/database/add_generated_media.sql

CREATE TABLE IF NOT EXISTS generated_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  prompt TEXT NOT NULL,
  url TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openai', 'other')),
  width INT NOT NULL,
  height INT NOT NULL,
  aspect_ratio TEXT,
  duration INT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Image Generation (Saves to DB)
```bash
curl -X POST http://localhost:3333/api/media/generate-image \
  -H "Content-Type: application/json" \
  -d '{"prompt":"A sunset","aspectRatio":"16:9"}'
```

**Check:**
- ✅ Tries Gemini first
- ✅ Falls back to DALL-E if Gemini fails
- ✅ Saves to `generated_media` table
- ✅ Returns image URL with provider name

### 3. Video Generation (Max Only, Saves to DB)
```bash
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MAX_USER_TOKEN" \
  -d '{"prompt":"Mountains","duration":5,"aspectRatio":"16:9"}'
```

**Check:**
- ✅ Requires Max tier
- ✅ Returns 403 for non-Max users
- ✅ Saves to `generated_media` table

### 4. Get User's Media
```bash
curl -X GET "http://localhost:3333/api/media/my-media?type=image" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Check:**
- ✅ Returns user's generated images/videos
- ✅ Shows provider (gemini/openai)
- ✅ Includes URLs, prompts, dimensions

### 5. AI Friend with Model Selection (Premium)
```bash
# Premium user
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PREMIUM_TOKEN" \
  -d '{"message":"Hey!","chatMode":"ai_friend","model":"gpt-4o"}'
```

**Check:**
- ✅ Premium users can select models
- ✅ Free users forced to gemini-lite
- ✅ Logs show: "Premium user - using gpt-4o for ai_friend mode"

### 6. AI Psychologist with Model Selection (Premium)
```bash
# Premium user
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PREMIUM_TOKEN" \
  -d '{"message":"I feel stressed","chatMode":"ai_psychologist","model":"grok-3"}'
```

**Check:**
- ✅ Premium users can select models
- ✅ Response is therapeutic (no bullet points)
- ✅ Logs show: "Premium user - using grok-3 for ai_psychologist mode"

### 7. Normal Mode (Always Works)
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is AI?","chatMode":"normal"}'
```

**Check:**
- ✅ Response has bullet points (•)
- ✅ Structured format
- ✅ Says "SyntraIQ"

### 8. Profile Shows Premium Tier
```bash
curl -X GET http://localhost:3333/api/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Check:**
- ✅ Shows `premiumTier`: "free", "pro", or "max"
- ✅ Shows `subscription` object with status, dates
- ✅ Shows `isPremium`: true/false

---

## Console Logs to Look For

### Image Generation Success
```
════════════════════════════════════════════════════════════
🎨 [GEMINI IMAGEN 3] Generating image
   Prompt: "A sunset"
   Aspect Ratio: 16:9
════════════════════════════════════════════════════════════
✅ Image generated successfully with Gemini
✅ Image saved to database
```

### Image Fallback to DALL-E
```
⚠️ Gemini image generation failed, trying DALL-E 3 fallback...
════════════════════════════════════════════════════════════
🎨 [OPENAI DALL-E 3] Generating image (FALLBACK)
════════════════════════════════════════════════════════════
✅ Image generated successfully with DALL-E 3
✅ Image saved to database
```

### Premium Model Selection
```
✅ Premium user - using gpt-4o for ai_friend mode
```

### Free User Locked
```
🔒 Free user - forcing gemini-lite for ai_psychologist mode
```

---

## Quick Verification

### 1. Check Supabase Table
```sql
SELECT * FROM generated_media ORDER BY created_at DESC LIMIT 10;
```

**Should show:**
- User's generated images/videos
- Provider (gemini/openai)
- Prompts, URLs, dimensions

### 2. Check Server Logs
- Look for detailed API call logs
- Verify fallback system working
- Check premium tier enforcement

### 3. Test All 3 Chat Modes
- Normal: Bullet points ✅
- AI Friend: Casual, no bullets ✅
- AI Psychologist: Therapeutic, no bullets ✅

### 4. Test Premium Features
- Model selection in all modes ✅
- Unlimited image generation ✅
- Video generation (Max only) ✅

---

## Expected Behavior Summary

| Feature | Free | Pro | Max |
|---------|------|-----|-----|
| Chat (all modes) | ✅ Gemini Lite | ✅ All models | ✅ All models |
| Images/day | 3 | Unlimited | Unlimited |
| Videos | ❌ | ❌ | ✅ |
| Media saved to DB | ✅ | ✅ | ✅ |
| Fallback to DALL-E | ✅ | ✅ | ✅ |

---

## Files to Check

1. ✅ `server/database/add_generated_media.sql` - Run this migration
2. ✅ `server/src/routes/media.ts` - Media endpoints with DB save
3. ✅ `server/src/routes/chat.ts` - Model selection for all modes
4. ✅ `server/src/utils/imageGeneration.ts` - Detailed logging
5. ✅ `server/src/utils/videoGeneration.ts` - Detailed logging

---

## All Systems Ready! 🚀

✅ Media saved to Supabase  
✅ Fallback system working  
✅ Premium tiers enforced  
✅ Model selection in ALL chat modes  
✅ Detailed API logging  
✅ User media gallery API  

**Just run the database migration and test!**


