# Premium Tiers System - SyntraIQ

## Overview

SyntraIQ has **3 subscription tiers**:
1. **Free** - Basic features
2. **Pro** - Advanced features
3. **Max** - Premium features with highest limits

---

## Tier Comparison

| Feature | Free | Pro | Max |
|---------|------|-----|-----|
| **Chat History** | 5 messages | 20 messages | 20 messages |
| **AI Models** | Gemini Lite only | All models | All models |
| **Image Generation** | Limited | Yes | Yes |
| **Video Generation** | No | Limited | Yes |
| **Search History** | 30 days | Unlimited | Unlimited |
| **Library Items** | 50 items | Unlimited | Unlimited |
| **Priority Support** | No | No | Yes |
| **API Rate Limits** | Standard | Higher | Highest |

---

## Database Schema

### Premium Tier Field
```sql
ALTER TABLE user_profiles
  ADD COLUMN premium_tier TEXT DEFAULT 'free' 
  CHECK (premium_tier IN ('free', 'pro', 'max'));
```

### Subscription Fields
```sql
- subscription_id: TEXT
- razorpay_subscription_id: TEXT
- razorpay_plan_id: TEXT
- subscription_start_date: TIMESTAMPTZ
- subscription_end_date: TIMESTAMPTZ
- subscription_status: TEXT ('active', 'inactive', 'cancelled', 'expired', 'paused')
- auto_renew: BOOLEAN
```

---

## API Response Format

### GET /api/profile

**Response:**
```json
{
  "id": "user-uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "notifications": true,
  "darkMode": false,
  "searchHistory": true,
  "voiceSearch": true,
  "isPremium": true,
  "premiumTier": "pro",
  "subscription": {
    "status": "active",
    "tier": "pro",
    "startDate": "2025-12-01T00:00:00Z",
    "endDate": "2026-01-01T00:00:00Z",
    "autoRenew": true,
    "razorpaySubscriptionId": "sub_xyz123"
  }
}
```

### Field Explanations

| Field | Type | Description |
|-------|------|-------------|
| `isPremium` | boolean | True if user has active Pro or Max subscription |
| `premiumTier` | string | Current tier: "free", "pro", or "max" |
| `subscription.status` | string | "active", "inactive", "cancelled", "expired", "paused" |
| `subscription.tier` | string | Same as premiumTier |
| `subscription.startDate` | string | When subscription started |
| `subscription.endDate` | string | When subscription expires |
| `subscription.autoRenew` | boolean | Will renew automatically |
| `subscription.razorpaySubscriptionId` | string | Razorpay subscription ID for management |

---

## Checking Premium Status in Code

### In Chat Routes
```typescript
// Check premium status
let isPremium = false;
let premiumTier = 'free';

if (req.userId) {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('premium_tier, subscription_status, subscription_end_date')
    .eq('user_id', req.userId)
    .single();

  if (profile) {
    const hasActiveSubscription = 
      profile.subscription_status === 'active' && 
      profile.subscription_end_date && 
      new Date(profile.subscription_end_date) > new Date();
    
    premiumTier = profile.premium_tier || 'free';
    isPremium = (premiumTier === 'pro' || premiumTier === 'max') && hasActiveSubscription;
  }
}

// Use isPremium and premiumTier to control features
if (!isPremium) {
  // Free user - limit features
  actualModel = 'gemini-lite'; // Force free model
  messageLimit = 5; // Limit chat history
} else if (premiumTier === 'pro') {
  // Pro user - advanced features
  messageLimit = 20;
  // Allow all models
} else if (premiumTier === 'max') {
  // Max user - premium features
  messageLimit = 20;
  // Allow all models + priority processing
}
```

---

## Frontend Display Examples

### Profile Page
```jsx
// Show user's current tier
<div className="subscription-card">
  <h3>Your Plan: {profile.premiumTier.toUpperCase()}</h3>
  
  {profile.isPremium ? (
    <>
      <p>Status: {profile.subscription.status}</p>
      <p>Renews: {new Date(profile.subscription.endDate).toLocaleDateString()}</p>
      <p>Auto-renew: {profile.subscription.autoRenew ? 'On' : 'Off'}</p>
      
      {profile.premiumTier === 'pro' && (
        <div className="badge">PRO MEMBER</div>
      )}
      
      {profile.premiumTier === 'max' && (
        <div className="badge premium">MAX MEMBER</div>
      )}
    </>
  ) : (
    <button onClick={handleUpgrade}>Upgrade to Pro</button>
  )}
</div>
```

### Chat Interface
```jsx
// Show model selector based on tier
{profile.isPremium ? (
  <select>
    <option value="gemini-lite">Gemini Lite</option>
    <option value="gemini-2.0-latest">Gemini 2.0</option>
    <option value="gpt-4o">GPT-4o</option>
    <option value="grok-3">Grok 3</option>
    {profile.premiumTier === 'max' && (
      <>
        <option value="grok-4-heavy">Grok 4 Heavy</option>
        <option value="gpt-5">GPT-5</option>
      </>
    )}
  </select>
) : (
  <div>
    <p>Using: Gemini Lite (Free)</p>
    <button onClick={handleUpgrade}>Unlock Premium Models</button>
  </div>
)}
```

---

## Testing Premium Tiers

### Test 1: Check Profile Response
```bash
curl -X GET http://localhost:3333/api/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "isPremium": true,
  "premiumTier": "pro",
  "subscription": {
    "status": "active",
    "tier": "pro",
    "startDate": "2025-12-01T00:00:00Z",
    "endDate": "2026-01-01T00:00:00Z"
  }
}
```

### Test 2: Free User
```json
{
  "isPremium": false,
  "premiumTier": "free",
  "subscription": {
    "status": "inactive",
    "tier": "free",
    "startDate": null,
    "endDate": null
  }
}
```

### Test 3: Pro User
```json
{
  "isPremium": true,
  "premiumTier": "pro",
  "subscription": {
    "status": "active",
    "tier": "pro"
  }
}
```

### Test 4: Max User
```json
{
  "isPremium": true,
  "premiumTier": "max",
  "subscription": {
    "status": "active",
    "tier": "max"
  }
}
```

---

## Subscription Status Flow

```
New User
  ↓
[Free Tier]
  ↓ (Purchase Pro)
[Pro - Active]
  ↓ (Subscription ends)
[Pro - Expired] → Back to [Free]
  ↓ (Auto-renew)
[Pro - Active]
  ↓ (Upgrade to Max)
[Max - Active]
  ↓ (Cancel)
[Max - Cancelled] → [Free] (at end date)
```

---

## Razorpay Integration

### Plan IDs (from razorpayPlans.ts)
```typescript
export const RAZORPAY_PLANS = {
  pro: {
    monthly: 'plan_pro_monthly',
    yearly: 'plan_pro_yearly'
  },
  max: {
    monthly: 'plan_max_monthly',
    yearly: 'plan_max_yearly'
  }
};
```

### When User Subscribes
1. User clicks "Upgrade to Pro"
2. Frontend calls `/api/payment/create-subscription`
3. Backend creates Razorpay subscription
4. User completes payment
5. Webhook updates `user_profiles`:
   - `premium_tier` = 'pro'
   - `subscription_status` = 'active'
   - `subscription_start_date` = now
   - `subscription_end_date` = now + 1 month/year
   - `razorpay_subscription_id` = subscription ID

---

## Admin Operations

### Make User Premium (Pro)
```sql
UPDATE user_profiles
SET 
  premium_tier = 'pro',
  subscription_status = 'active',
  subscription_start_date = NOW(),
  subscription_end_date = NOW() + INTERVAL '1 month',
  auto_renew = true
WHERE user_id = 'user-uuid';
```

### Upgrade to Max
```sql
UPDATE user_profiles
SET 
  premium_tier = 'max',
  subscription_end_date = NOW() + INTERVAL '1 month'
WHERE user_id = 'user-uuid';
```

### Cancel Subscription
```sql
UPDATE user_profiles
SET 
  subscription_status = 'cancelled',
  auto_renew = false
WHERE user_id = 'user-uuid';
```

### Expire Subscription
```sql
-- Run daily cron job
UPDATE user_profiles
SET 
  subscription_status = 'expired',
  premium_tier = 'free'
WHERE 
  subscription_status = 'active' 
  AND subscription_end_date < NOW();
```

---

## Feature Gating Examples

### Chat History Limit
```typescript
const messageLimit = isPremium ? 20 : 5;
```

### Model Access
```typescript
if (!isPremium && model !== 'gemini-lite') {
  return res.status(403).json({ 
    error: 'Premium model requires Pro or Max subscription',
    upgrade_url: '/upgrade'
  });
}
```

### Image Generation
```typescript
if (!isPremium) {
  return res.status(403).json({ 
    error: 'Image generation requires Pro or Max subscription' 
  });
}
```

### Video Generation (Max only)
```typescript
if (premiumTier !== 'max') {
  return res.status(403).json({ 
    error: 'Video generation requires Max subscription' 
  });
}
```

---

## Summary

✅ **Profile API now returns:**
- `isPremium` (boolean)
- `premiumTier` ('free', 'pro', 'max')
- Full `subscription` object with status, dates, etc.

✅ **Frontend can:**
- Show user's current tier
- Display subscription status
- Show expiry date
- Enable/disable features based on tier

✅ **Backend can:**
- Check premium status easily
- Gate features by tier
- Track subscription lifecycle

**All premium tier information is now properly exposed in the API!** 🎉

