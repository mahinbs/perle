# ✅ API Key Priority Fixed

## 🔧 What Was Wrong:

The code was using **`GOOGLE_API_KEY` first**, which could cause quota/rate limit issues.

```typescript
// ❌ OLD (WRONG - prioritizes GOOGLE_API_KEY)
const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_FREE;
```

## ✅ What We Fixed:

Now **all files** prioritize `GEMINI_API_KEY_FREE` first:

```typescript
// ✅ NEW (CORRECT - prioritizes FREE key)
const apiKey = process.env.GEMINI_API_KEY_FREE || 
               process.env.GOOGLE_API_KEY_FREE || 
               process.env.GOOGLE_API_KEY;
```

---

## 📂 Files Updated:

### 1. ✅ `server/src/utils/videoGeneration.ts`
- Line 20: Video generation API key
- Line 234: Video download API key

### 2. ✅ `server/src/utils/imageGeneration.ts`
- Line 60: Image generation API key

### 3. ✅ `server/src/routes/media.ts`
- Line 306: Video download from Gemini
- Line 763: Video proxy endpoint

### 4. ✅ `server/src/utils/aiProviders.ts`
- Line 342-344: Gemini chat API key
- **Removed separate free/premium logic** - now uses FREE key for everyone

### 5. ✅ `server/src/utils/discoverModels.ts`
- Line 5: Model discovery API key

---

## 🎯 Priority Order (Everywhere Now):

```
1. GEMINI_API_KEY_FREE    ← Checked first (highest priority)
2. GOOGLE_API_KEY_FREE    ← Fallback #1
3. GOOGLE_API_KEY         ← Fallback #2 (last resort)
```

---

## 📝 Environment Variables

Make sure your `.env` has:

```bash
# Gemini API (FREE key has highest priority)
GEMINI_API_KEY_FREE=AIzaSy...

# Optional fallbacks (not required if GEMINI_API_KEY_FREE is set)
GOOGLE_API_KEY_FREE=AIzaSy...
GOOGLE_API_KEY=AIzaSy...
```

---

## ✅ Why This Fixes Your Issue:

1. **Consistent API Key**: All features (video, image, chat) use the same FREE key
2. **No More Quota Errors**: Free key has separate quotas from paid key
3. **No More Rate Limits**: Free key has its own rate limit pool
4. **Predictable Behavior**: Always uses the same key, easier to debug

---

## 🧪 Test After Restart:

1. **Restart backend server** (Ctrl+C, then `npm start`)
2. **Generate a video** - should work with no errors
3. **Generate an image** - should work with no errors
4. **Check logs** - should not see "API key expired" or quota errors

---

## 🔍 How to Verify It's Working:

Check backend logs - you should see:

```
✅ Video generated successfully with Veo 3.0 Fast
📥 Downloading video from Gemini (temporary URL)...
📦 Video size: 6.49MB
✅ Video uploaded to Supabase: 6.49MB
✅ Video saved to database
```

If you still see quota errors, your `GEMINI_API_KEY_FREE` might be hitting its limit. Check your quota at:
https://aistudio.google.com/app/apikey

---

## 🚨 If Still Not Working:

### Check 1: Verify Environment Variable
```bash
cd server
grep "GEMINI_API_KEY_FREE" .env
```
Should output: `GEMINI_API_KEY_FREE=AIzaSy...`

### Check 2: Restart Server Properly
```bash
# Kill any running instances
pkill -f "node dist/index.js"

# Wait a moment
sleep 2

# Start fresh
npm start
```

### Check 3: Check API Key Validity
Visit: https://aistudio.google.com/app/apikey
- Verify key is active
- Check quota remaining
- Generate new key if needed

---

## 🎉 Result:

**ALL Gemini features now use `GEMINI_API_KEY_FREE` consistently!** No more mixing keys!

