# Test Video Generation Quotas

## Quick Test Commands

Make sure:
1. Server is running: `npm run dev`
2. You have JWT tokens for Pro and Max users
3. Users have active subscriptions

---

## Test 1: Check Quota (Pro User)

```bash
curl -X GET http://localhost:3333/api/media/quota \
  -H "Authorization: Bearer PRO_USER_TOKEN"
```

**Expected Response**:
```json
{
  "tier": "pro",
  "video": {
    "used": 0,
    "limit": 3,
    "remaining": 3,
    "hasAccess": true
  },
  "image": {
    "used": 0,
    "limit": -1,
    "remaining": -1,
    "hasAccess": true
  },
  "resetTime": "2025-12-31T00:00:00.000Z"
}
```

---

## Test 2: Generate Video (Pro User - 1st Video)

```bash
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PRO_USER_TOKEN" \
  -d '{
    "prompt": "A beautiful sunset over the ocean with waves crashing",
    "duration": 5,
    "aspectRatio": "16:9"
  }'
```

**Expected**: ✅ Success (200 OK)
```json
{
  "success": true,
  "video": {
    "url": "...",
    "prompt": "A beautiful sunset...",
    "duration": 5,
    "aspectRatio": "16:9",
    "provider": "gemini"
  }
}
```

---

## Test 3: Generate Video (Pro User - 2nd Video)

```bash
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PRO_USER_TOKEN" \
  -d '{
    "prompt": "A bustling city street with cars and people",
    "duration": 5,
    "aspectRatio": "16:9"
  }'
```

**Expected**: ✅ Success (200 OK)

---

## Test 4: Generate Video (Pro User - 3rd Video)

```bash
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PRO_USER_TOKEN" \
  -d '{
    "prompt": "A forest path with sunlight filtering through trees",
    "duration": 5,
    "aspectRatio": "16:9"
  }'
```

**Expected**: ✅ Success (200 OK) - Last video for today

---

## Test 5: Generate Video (Pro User - 4th Video - SHOULD FAIL)

```bash
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PRO_USER_TOKEN" \
  -d '{
    "prompt": "A mountain landscape with snow peaks",
    "duration": 5,
    "aspectRatio": "16:9"
  }'
```

**Expected**: ❌ **429 Too Many Requests**
```json
{
  "error": "Daily video generation limit reached. Upgrade to Max for 6 videos per day.",
  "limit": 3,
  "used": 3,
  "tier": "pro"
}
```

---

## Test 6: Check Quota After Limit (Pro User)

```bash
curl -X GET http://localhost:3333/api/media/quota \
  -H "Authorization: Bearer PRO_USER_TOKEN"
```

**Expected**:
```json
{
  "tier": "pro",
  "video": {
    "used": 3,
    "limit": 3,
    "remaining": 0,
    "hasAccess": true
  },
  "image": {
    "used": 0,
    "limit": -1,
    "remaining": -1,
    "hasAccess": true
  },
  "resetTime": "2025-12-31T00:00:00.000Z"
}
```

---

## Test 7: Check Quota (Max User)

```bash
curl -X GET http://localhost:3333/api/media/quota \
  -H "Authorization: Bearer MAX_USER_TOKEN"
```

**Expected**:
```json
{
  "tier": "max",
  "video": {
    "used": 0,
    "limit": 6,
    "remaining": 6,
    "hasAccess": true
  },
  "image": {
    "used": 0,
    "limit": -1,
    "remaining": -1,
    "hasAccess": true
  },
  "resetTime": "2025-12-31T00:00:00.000Z"
}
```

---

## Test 8: Generate Multiple Videos (Max User)

```bash
# Video 1
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MAX_USER_TOKEN" \
  -d '{"prompt": "Max user video 1", "duration": 5}'

# Video 2
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MAX_USER_TOKEN" \
  -d '{"prompt": "Max user video 2", "duration": 5}'

# Video 3
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MAX_USER_TOKEN" \
  -d '{"prompt": "Max user video 3", "duration": 5}'

# Video 4
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MAX_USER_TOKEN" \
  -d '{"prompt": "Max user video 4", "duration": 5}'

# Video 5
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MAX_USER_TOKEN" \
  -d '{"prompt": "Max user video 5", "duration": 5}'

# Video 6
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MAX_USER_TOKEN" \
  -d '{"prompt": "Max user video 6", "duration": 5}'
```

**Expected**: All 6 should succeed ✅

---

## Test 9: Generate 7th Video (Max User - SHOULD FAIL)

```bash
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MAX_USER_TOKEN" \
  -d '{
    "prompt": "Max user video 7 - should fail",
    "duration": 5
  }'
```

**Expected**: ❌ **429 Too Many Requests**
```json
{
  "error": "Daily video generation limit reached. You have reached your daily limit of 6 videos.",
  "limit": 6,
  "used": 6,
  "tier": "max"
}
```

---

## Test 10: Free User (No Access)

```bash
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer FREE_USER_TOKEN" \
  -d '{
    "prompt": "Free user trying to generate video",
    "duration": 5
  }'
```

**Expected**: ❌ **403 Forbidden**
```json
{
  "error": "Video generation requires Pro or Max subscription",
  "currentTier": "free",
  "requiredTier": "pro or max"
}
```

---

## Test 11: Check Free User Quota

```bash
curl -X GET http://localhost:3333/api/media/quota \
  -H "Authorization: Bearer FREE_USER_TOKEN"
```

**Expected**:
```json
{
  "tier": "free",
  "video": {
    "used": 0,
    "limit": 0,
    "remaining": 0,
    "hasAccess": false
  },
  "image": {
    "used": 0,
    "limit": 3,
    "remaining": 3,
    "hasAccess": true
  },
  "resetTime": "2025-12-31T00:00:00.000Z"
}
```

---

## Test 12: Get User's Generated Videos

```bash
curl -X GET "http://localhost:3333/api/media/my-media?type=video&limit=10" \
  -H "Authorization: Bearer PRO_USER_TOKEN"
```

**Expected**:
```json
{
  "media": [
    {
      "id": "uuid",
      "user_id": "user-uuid",
      "media_type": "video",
      "prompt": "A beautiful sunset...",
      "url": "...",
      "provider": "gemini",
      "width": 1920,
      "height": 1080,
      "aspect_ratio": "16:9",
      "duration": 5,
      "created_at": "2025-12-30T10:30:00Z"
    },
    // ... more videos
  ],
  "total": 3,
  "limit": 10,
  "offset": 0
}
```

---

## Summary of Expected Results

| Test | User | Action | Expected Result |
|------|------|--------|-----------------|
| 1 | Pro | Check quota | 0/3 used |
| 2-4 | Pro | Generate 3 videos | All succeed ✅ |
| 5 | Pro | Generate 4th video | **429 Quota exceeded** ❌ |
| 6 | Pro | Check quota | 3/3 used (0 remaining) |
| 7 | Max | Check quota | 0/6 used |
| 8 | Max | Generate 6 videos | All succeed ✅ |
| 9 | Max | Generate 7th video | **429 Quota exceeded** ❌ |
| 10 | Free | Generate video | **403 Forbidden** ❌ |
| 11 | Free | Check quota | No video access |
| 12 | Pro | Get history | Shows generated videos |

---

## How to Get JWT Tokens

### 1. Login as Pro User
```bash
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "pro-user@example.com",
    "password": "password"
  }'
```

Copy the `token` from response.

### 2. Login as Max User
```bash
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "max-user@example.com",
    "password": "password"
  }'
```

Copy the `token` from response.

### 3. Login as Free User
```bash
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "free-user@example.com",
    "password": "password"
  }'
```

Copy the `token` from response.

---

## Verify Database

### Check today's video count for a user
```sql
SELECT COUNT(*) as video_count
FROM generated_media
WHERE user_id = 'user-uuid-here'
  AND media_type = 'video'
  AND created_at >= CURRENT_DATE;
```

### Check user's premium tier
```sql
SELECT 
  u.email,
  up.premium_tier,
  up.subscription_status,
  up.subscription_end_date
FROM auth.users u
JOIN user_profiles up ON u.id = up.user_id
WHERE u.email = 'user@example.com';
```

---

**All tests ready! Start with Test 1 and work through sequentially.** ✅

