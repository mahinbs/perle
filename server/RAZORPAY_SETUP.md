# Razorpay Payment Integration Setup

## Prerequisites

1. Create a Razorpay account at https://razorpay.com
2. Get your API keys from Razorpay Dashboard → Settings → API Keys

## Step 1: Create Razorpay Plans

Before using subscriptions, you need to create plans in Razorpay:

### Option A: Using the Setup Script (Recommended)

```bash
cd server
node scripts/create-razorpay-plans.js
```

This will create both plans and output the Plan IDs. Copy them to your `.env` file.

### Option B: Manual Creation via Razorpay Dashboard

1. Go to Razorpay Dashboard → Products → Plans
2. Create two monthly plans:
   - **IQ Pro**: ₹399/month
   - **IQ Max**: ₹899/month
3. Copy the Plan IDs (format: `plan_xxxxxxxxxxxxx`)

## Step 2: Environment Variables

Add these to your `.env` file in the `server/` directory:

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret_key_here
RAZORPAY_PLAN_ID_PRO=plan_xxxxxxxxxxxxx  # From Step 1
RAZORPAY_PLAN_ID_MAX=plan_xxxxxxxxxxxxx  # From Step 1
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret  # Optional, for webhook verification
```

## For Production

1. Switch to **Live Mode** in Razorpay Dashboard
2. Get your **Live API Keys**
3. Update environment variables:
   ```env
   RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=your_live_secret_key_here
   ```

## Supabase Secrets (for Edge Functions)

If deploying to Supabase Edge Functions, add these secrets:

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
supabase secrets set RAZORPAY_KEY_SECRET=your_secret_key_here
```

## Database Migration

Run the SQL migration to add premium tier support:

```sql
-- Run this in Supabase SQL Editor
-- See: server/database/add_premium_tier.sql
```

## Testing

1. Use Razorpay **Test Mode** for development
2. Test cards: https://razorpay.com/docs/payments/test-cards/
3. Common test card: `4111 1111 1111 1111` (any future expiry, any CVV)

## Payment Flow (Subscriptions with Auto-Renewal)

1. User clicks "Subscribe" → Frontend calls `/api/payment/create-subscription`
2. Backend creates Razorpay subscription → Returns subscription ID and key
3. Frontend opens Razorpay checkout (with subscription_id)
4. User completes payment → Razorpay calls handler
5. Frontend calls `/api/payment/verify-subscription` → Backend verifies signature
6. Backend activates subscription → Updates user profile
7. **Auto-renewal**: Razorpay automatically charges user each month (if enabled)
8. **Webhooks**: Razorpay sends webhook events for renewals, cancellations, etc.

## Security Notes

- **Never expose** `RAZORPAY_KEY_SECRET` in frontend code
- Always verify payment signature on backend
- Check order belongs to user before activating subscription
- Validate amounts match expected plan prices

## Subscription Plans

- **IQ Pro:** ₹399/month (39900 paise)
- **IQ Max:** ₹899/month (89900 paise)

## Auto-Renewal Features

### How Auto-Renewal Works

1. **When Enabled**: 
   - User is automatically charged each month at the end of the billing cycle
   - Works with both **Card** and **UPI** (UPI auto-debit for amounts < ₹15,000)
   - Subscription continues automatically without user intervention

2. **When Disabled**:
   - User is charged only once for the current month
   - Subscription expires at the end of the billing period
   - User must manually renew if they want to continue

3. **User Control**:
   - Users can toggle auto-renewal ON/OFF from the subscription page
   - Changes take effect immediately
   - When disabled, subscription continues until current period ends

### Payment Methods Supported for Auto-Renewal

- ✅ **Credit/Debit Cards**: Fully supported
- ✅ **UPI**: Supported for amounts < ₹15,000 (both plans qualify)
- ❌ **Netbanking**: Not supported for auto-renewal
- ❌ **Wallets**: Not supported for auto-renewal

## Webhook Setup (Required for Auto-Renewal)

Set up webhooks to handle subscription events:

1. Go to Razorpay Dashboard → Settings → Webhooks
2. Add webhook URL: `https://your-domain.com/api/payment/webhook`
3. Select events:
   - `subscription.activated`
   - `subscription.charged` (for renewals)
   - `subscription.cancelled`
   - `subscription.paused`
   - `subscription.completed`
4. Copy the webhook secret and add to `.env`:
   ```env
   RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
   ```

### Webhook Events Handled

- **subscription.charged**: Automatically renews subscription and updates end date
- **subscription.cancelled**: Marks subscription as cancelled
- **subscription.paused**: Pauses subscription (auto-renewal disabled)
- **subscription.completed**: Marks subscription as expired

