# Video Generation Quotas - Implementation Guide

## 📊 Daily Quotas by Tier

| Tier | Videos per Day | Images per Day | Notes |
|------|----------------|----------------|-------|
| **Free** | 0 | 3 | No video access |
| **Pro** | 3 | Unlimited | Basic video generation |
| **Max** | 6 | Unlimited | Double video quota |

---

## 🎯 Changes Made

### 1. **Video Access Expanded**
- **Before**: Only Max users could generate videos
- **After**: Both Pro and Max users can generate videos

### 2. **Daily Quotas Implemented**
- **Pro Users**: 3 videos per day
- **Max Users**: 6 videos per day
- **Quota resets**: Daily at midnight (00:00:00 local server time)

### 3. **New API Endpoint**
- `GET /api/media/quota` - Check remaining video/image quota

---

## 🔧 Technical Implementation

### Video Generation Endpoint (`POST /api/media/generate-video`)

#### Updated Logic
```typescript
// 1. Check if user has Pro or Max tier
if (premiumTier !== 'pro' && premiumTier !== 'max') {
  return 403; // Forbidden
}

// 2. Check daily video count
const videoCount = await getVideosGeneratedToday(userId);

// 3. Apply tier-based limit
const dailyLimit = premiumTier === 'max' ? 6 : 3;

// 4. Block if limit reached
if (videoCount >= dailyLimit) {
  return 429; // Too Many Requests
}

// 5. Generate video and increment count
```

### Quota Check Endpoint (`GET /api/media/quota`)

Returns user's current usage and limits:

```json
{
  "tier": "pro",
  "video": {
    "used": 2,
    "limit": 3,
    "remaining": 1,
    "hasAccess": true
  },
  "image": {
    "used": 5,
    "limit": -1,
    "remaining": -1,
    "hasAccess": true
  },
  "resetTime": "2025-12-31T00:00:00.000Z"
}
```

**Note**: `limit: -1` and `remaining: -1` means unlimited.

---

## 📡 API Usage Examples

### Test Video Generation (Pro User)

```bash
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "A serene lake at sunset with mountains in the background",
    "duration": 5,
    "aspectRatio": "16:9"
  }'
```

**Success Response** (if under quota):
```json
{
  "success": true,
  "video": {
    "url": "https://...",
    "prompt": "A serene lake...",
    "duration": 5,
    "width": 1920,
    "height": 1080,
    "aspectRatio": "16:9",
    "provider": "gemini"
  }
}
```

**Error Response** (quota exceeded):
```json
{
  "error": "Daily video generation limit reached. Upgrade to Max for 6 videos per day.",
  "limit": 3,
  "used": 3,
  "tier": "pro"
}
```

### Check Quota

```bash
curl -X GET http://localhost:3333/api/media/quota \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response**:
```json
{
  "tier": "pro",
  "video": {
    "used": 2,
    "limit": 3,
    "remaining": 1,
    "hasAccess": true
  },
  "image": {
    "used": 15,
    "limit": -1,
    "remaining": -1,
    "hasAccess": true
  },
  "resetTime": "2025-12-31T00:00:00.000Z"
}
```

---

## 🚨 Error Responses

### 1. Not Premium (Free User)
**Status**: `403 Forbidden`
```json
{
  "error": "Video generation requires Pro or Max subscription",
  "currentTier": "free",
  "requiredTier": "pro or max"
}
```

### 2. Quota Exceeded (Pro User - 3/3 used)
**Status**: `429 Too Many Requests`
```json
{
  "error": "Daily video generation limit reached. Upgrade to Max for 6 videos per day.",
  "limit": 3,
  "used": 3,
  "tier": "pro"
}
```

### 3. Quota Exceeded (Max User - 6/6 used)
**Status**: `429 Too Many Requests`
```json
{
  "error": "Daily video generation limit reached. You have reached your daily limit of 6 videos.",
  "limit": 6,
  "used": 6,
  "tier": "max"
}
```

### 4. Invalid Request
**Status**: `400 Bad Request`
```json
{
  "error": "Invalid request",
  "details": {
    "prompt": ["Required"],
    "duration": ["Must be between 2 and 10"]
  }
}
```

---

## 📊 Database Tracking

### Table: `generated_media`

Videos are tracked in the `generated_media` table:

```sql
SELECT 
  user_id,
  COUNT(*) as video_count,
  DATE(created_at) as date
FROM generated_media
WHERE media_type = 'video'
  AND created_at >= CURRENT_DATE
GROUP BY user_id, DATE(created_at);
```

### Query Today's Video Count

```sql
SELECT COUNT(*) as count
FROM generated_media
WHERE user_id = 'user-uuid-here'
  AND media_type = 'video'
  AND created_at >= CURRENT_DATE;
```

---

## 🎨 Frontend Integration

### Display Quota to Users

```typescript
// Fetch quota
const response = await fetch('/api/media/quota', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const quota = await response.json();

// Display to user
console.log(`Videos: ${quota.video.remaining} left today`);
console.log(`Tier: ${quota.tier}`);

// Show upgrade prompt if Pro user reaches limit
if (quota.tier === 'pro' && quota.video.remaining === 0) {
  showUpgradeModal('Upgrade to Max for 6 videos per day!');
}
```

### Handle Quota Exceeded

```typescript
async function generateVideo(prompt: string) {
  try {
    const response = await fetch('/api/media/generate-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ prompt })
    });

    if (response.status === 429) {
      const error = await response.json();
      alert(`Quota exceeded: ${error.error}`);
      if (error.tier === 'pro') {
        showUpgradeModal();
      }
      return;
    }

    const result = await response.json();
    return result.video;
  } catch (error) {
    console.error('Video generation failed:', error);
  }
}
```

---

## 🔄 Quota Reset Logic

### When Does Quota Reset?

Quotas reset **daily at midnight (00:00:00)** in the server's timezone.

### How It Works

The query checks for videos created today:
```typescript
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0); // Midnight today

const { count } = await supabase
  .from('generated_media')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId)
  .eq('media_type', 'video')
  .gte('created_at', todayStart.toISOString());
```

**Example**:
- Today is Dec 30, 2025
- User generates 3 videos (Pro tier limit reached)
- At midnight on Dec 31, 2025, the query only counts videos from Dec 31 onwards
- User can generate 3 more videos

---

## 📈 Usage Monitoring

### Admin Queries

**Check most active video generators**:
```sql
SELECT 
  u.email,
  up.premium_tier,
  COUNT(*) as videos_today
FROM generated_media gm
JOIN auth.users u ON gm.user_id = u.id
JOIN user_profiles up ON gm.user_id = up.user_id
WHERE gm.media_type = 'video'
  AND gm.created_at >= CURRENT_DATE
GROUP BY u.email, up.premium_tier
ORDER BY videos_today DESC
LIMIT 20;
```

**Check quota violations** (shouldn't happen if code is correct):
```sql
SELECT 
  gm.user_id,
  up.premium_tier,
  COUNT(*) as videos_today,
  CASE 
    WHEN up.premium_tier = 'max' THEN 6
    WHEN up.premium_tier = 'pro' THEN 3
    ELSE 0
  END as limit
FROM generated_media gm
JOIN user_profiles up ON gm.user_id = up.user_id
WHERE gm.media_type = 'video'
  AND gm.created_at >= CURRENT_DATE
GROUP BY gm.user_id, up.premium_tier
HAVING COUNT(*) > CASE 
  WHEN up.premium_tier = 'max' THEN 6
  WHEN up.premium_tier = 'pro' THEN 3
  ELSE 0
END;
```

---

## 🎯 Benefits by Tier

### Free Tier
- ❌ No video generation
- ✅ 3 images per day
- 💡 **Upgrade to Pro** for video access

### Pro Tier ($X/month)
- ✅ **3 videos per day**
- ✅ Unlimited images
- ✅ Access to Claude models
- 💡 **Upgrade to Max** for double video quota

### Max Tier ($Y/month)
- ✅ **6 videos per day** (2x Pro)
- ✅ Unlimited images
- ✅ Access to all premium features
- ✅ Priority support

---

## 🧪 Testing Guide

### Test Case 1: Pro User - Within Quota
```bash
# Generate 1st video (should succeed)
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Authorization: Bearer PRO_USER_TOKEN" \
  -d '{"prompt": "Test video 1"}'
# Expected: 200 OK

# Check quota
curl http://localhost:3333/api/media/quota \
  -H "Authorization: Bearer PRO_USER_TOKEN"
# Expected: {"video": {"used": 1, "limit": 3, "remaining": 2}}
```

### Test Case 2: Pro User - Quota Exceeded
```bash
# Generate 3 videos first (up to limit)
# Then try 4th video
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Authorization: Bearer PRO_USER_TOKEN" \
  -d '{"prompt": "Test video 4"}'
# Expected: 429 Too Many Requests with upgrade message
```

### Test Case 3: Max User - Higher Quota
```bash
# Max user can generate up to 6 videos
# Generate 6 videos (should all succeed)
# 7th video should fail with 429
```

### Test Case 4: Free User - No Access
```bash
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Authorization: Bearer FREE_USER_TOKEN" \
  -d '{"prompt": "Test video"}'
# Expected: 403 Forbidden
```

---

## 📝 Summary

✅ **Video Generation Access**:
- Pro users: 3 videos/day
- Max users: 6 videos/day
- Free users: No access

✅ **Image Generation**:
- Pro/Max users: Unlimited
- Free users: 3 images/day

✅ **New Endpoints**:
- `GET /api/media/quota` - Check remaining quota

✅ **Error Handling**:
- 403 for non-premium users
- 429 for quota exceeded
- Helpful upgrade messages

✅ **Database Tracking**:
- All media stored in `generated_media` table
- Daily quota resets at midnight

---

**Video generation quotas are now live! Pro users get 3 videos/day, Max users get 6 videos/day.** 🎉

