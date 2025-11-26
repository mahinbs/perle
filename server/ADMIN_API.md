# Admin API Documentation

## Overview

The Admin API allows authorized administrators to manage user premium subscriptions manually. This is useful for:
- Testing premium features
- Giving free trials
- Manual upgrades/downgrades
- Admin management

## Setup

### 1. Add Admin User IDs to Environment

Add your user ID(s) to the `.env` file:

```env
# Comma-separated list of admin user IDs
ADMIN_USER_IDS=84b04b04-12fa-4519-9030-34b142e7a3e7,another-user-id-here
```

**How to get your User ID:**
1. Login to your app
2. Check the browser console - it logs your user ID
3. Or check Supabase Dashboard → Authentication → Users → Copy the UUID

### 2. Alternative: Set Admin Role in User Metadata

You can also set a user as admin by updating their metadata in Supabase:

```sql
-- In Supabase SQL Editor
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'
)
WHERE email = 'your-admin-email@example.com';
```

## API Endpoints

All endpoints require:
- **Authentication**: Bearer token in `Authorization` header
- **Admin Access**: User must be in `ADMIN_USER_IDS` or have `role: 'admin'` in metadata

---

### 1. Update User Premium Tier

**POST** `/api/admin/users/:userId/premium`

Update a user's premium subscription status.

**Request Body:**
```json
{
  "tier": "pro",  // "free" | "pro" | "max"
  "subscriptionStatus": "active",  // Optional: "active" | "inactive" | "cancelled" | "expired" | "paused"
  "subscriptionEndDate": "2024-02-15T00:00:00Z",  // Optional: ISO date string (default: 30 days from now)
  "autoRenew": true  // Optional: boolean (default: true)
}
```

**Example:**
```bash
curl -X POST http://localhost:3333/api/admin/users/84b04b04-12fa-4519-9030-34b142e7a3e7/premium \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tier": "pro",
    "subscriptionStatus": "active",
    "autoRenew": true
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "User premium tier updated to pro",
  "user": {
    "id": "84b04b04-12fa-4519-9030-34b142e7a3e7",
    "email": "user@example.com",
    "premium_tier": "pro",
    "is_premium": true,
    "subscription_status": "active",
    "subscription_end_date": "2024-02-15T00:00:00.000Z"
  }
}
```

---

### 2. Get User Premium Status

**GET** `/api/admin/users/:userId/premium`

Get a user's current premium subscription status.

**Example:**
```bash
curl -X GET http://localhost:3333/api/admin/users/84b04b04-12fa-4519-9030-34b142e7a3e7/premium \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

**Response:**
```json
{
  "user": {
    "id": "84b04b04-12fa-4519-9030-34b142e7a3e7",
    "email": "user@example.com",
    "premium_tier": "pro",
    "is_premium": true,
    "subscription_status": "active",
    "subscription_start_date": "2024-01-15T00:00:00.000Z",
    "subscription_end_date": "2024-02-15T00:00:00.000Z",
    "auto_renew": true
  }
}
```

---

### 3. List All Premium Users

**GET** `/api/admin/users/premium`

Get a list of all users with premium subscriptions (pro or max).

**Example:**
```bash
curl -X GET http://localhost:3333/api/admin/users/premium \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

**Response:**
```json
{
  "count": 2,
  "users": [
    {
      "id": "84b04b04-12fa-4519-9030-34b142e7a3e7",
      "email": "user1@example.com",
      "premium_tier": "pro",
      "is_premium": true,
      "subscription_status": "active",
      "subscription_end_date": "2024-02-15T00:00:00.000Z"
    },
    {
      "id": "8683a8be-0ab0-40c3-ae10-aa37fbd8977e",
      "email": "user2@example.com",
      "premium_tier": "max",
      "is_premium": true,
      "subscription_status": "active",
      "subscription_end_date": "2024-02-20T00:00:00.000Z"
    }
  ]
}
```

---

## Quick Examples

### Make User Premium (IQ Pro)
```bash
curl -X POST http://localhost:3333/api/admin/users/USER_ID/premium \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tier": "pro"}'
```

### Make User Premium (IQ Max)
```bash
curl -X POST http://localhost:3333/api/admin/users/USER_ID/premium \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tier": "max"}'
```

### Remove Premium (Downgrade to Free)
```bash
curl -X POST http://localhost:3333/api/admin/users/USER_ID/premium \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tier": "free", "subscriptionStatus": "inactive"}'
```

### Give 7-Day Free Trial
```bash
curl -X POST http://localhost:3333/api/admin/users/USER_ID/premium \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tier": "pro",
    "subscriptionStatus": "active",
    "subscriptionEndDate": "'$(date -u -v+7d +"%Y-%m-%dT%H:%M:%SZ")'",
    "autoRenew": false
  }'
```

---

## Security Notes

⚠️ **Important:**
- Admin endpoints are protected by authentication AND admin check
- Only users in `ADMIN_USER_IDS` or with `role: 'admin'` can access these endpoints
- Never expose `ADMIN_USER_IDS` in frontend code
- Use these endpoints only for testing/admin purposes
- In production, consider adding rate limiting and audit logging

---

## Error Responses

**401 Unauthorized:**
```json
{
  "error": "Authentication required"
}
```

**403 Forbidden:**
```json
{
  "error": "Admin access required"
}
```

**400 Bad Request:**
```json
{
  "error": "Invalid request",
  "details": {
    "tier": ["Invalid enum value. Expected 'free' | 'pro' | 'max'"]
  }
}
```

**404 Not Found:**
```json
{
  "error": "User profile not found"
}
```

