# 📧 OTP Email Verification Setup Guide

## ✅ What's Been Created

1. **Database Schema** (`server/database/otp_schema.sql`)
   - `email_otps` table for storing OTP codes
   - `email_verified` column added to `users` table
   - Indexes for performance

2. **Backend Endpoints**
   - `POST /api/auth/signup` - Now sends OTP email
   - `POST /api/auth/verify-otp` - Verify 6-digit OTP
   - `POST /api/auth/resend-otp` - Resend verification code

3. **Beautiful Email Template**
   - HTML email matching SyntraIQ design
   - Gold gradient header
   - Large, readable 6-digit code
   - Professional styling

4. **Verification Page** (`/verify`)
   - Beautiful 6-digit OTP input
   - Auto-focus and auto-submit
   - Paste support
   - Resend functionality with countdown
   - Matches your UI design

## 🚀 Setup Steps

### Step 1: Run Database Schema

1. Go to your Supabase project
2. Open **SQL Editor**
3. Copy and run the contents of `server/database/otp_schema.sql`

This creates:
- `email_otps` table
- `email_verified` column in `users` table
- Indexes for fast lookups

### Step 2: Configure Email Service (Optional for Production)

Currently, the email is logged to console in development. For production, you need to integrate an email service:

**Option 1: Resend (Recommended)**
```bash
cd server
npm install resend
```

Add to `server/.env`:
```env
RESEND_API_KEY=your-resend-api-key
```

Then uncomment the Resend code in `server/src/utils/email.ts`

**Option 2: SendGrid, AWS SES, or other services**
- Follow similar pattern in `server/src/utils/email.ts`

### Step 3: Test the Flow

1. **Start Backend:**
   ```bash
   cd server
   npm run dev
   ```

2. **Start Frontend:**
   ```bash
   npm run dev
   ```

3. **Test Signup:**
   - Go to Profile page
   - Click "Sign Up"
   - Fill in details and submit
   - You'll be redirected to `/verify` page
   - In development, OTP will be shown in:
     - Browser console
     - Alert popup (if enabled)
     - Backend terminal logs

4. **Enter OTP:**
   - Type the 6-digit code
   - Or paste it
   - Code auto-submits when all 6 digits entered

## 🎨 Email Template Features

- **Beautiful Design**: Matches SyntraIQ gold theme
- **Responsive**: Works on all devices
- **Clear OTP Display**: Large, monospace font
- **Professional**: Includes expiration notice
- **Branded**: SyntraIQ logo and colors

## 🔧 Development Mode

In development (`NODE_ENV !== 'production'`):
- OTP is logged to console
- OTP is returned in API response (for testing)
- Email sending is simulated

## 📝 API Endpoints

### Signup (Updated)
```json
POST /api/auth/signup
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Password123"
}

Response:
{
  "requiresVerification": true,
  "email": "john@example.com",
  "message": "Please check your email for the verification code",
  "devOTP": "123456" // Only in development
}
```

### Verify OTP
```json
POST /api/auth/verify-otp
{
  "email": "john@example.com",
  "otp": "123456"
}

Response:
{
  "token": "session-token",
  "user": { ... }
}
```

### Resend OTP
```json
POST /api/auth/resend-otp
{
  "email": "john@example.com"
}

Response:
{
  "message": "Verification code sent to your email",
  "devOTP": "123456" // Only in development
}
```

## 🔒 Security Features

- OTP expires in 10 minutes
- Maximum 5 verification attempts
- OTPs are hashed in database
- Auto-cleanup of expired OTPs
- One-time use (verified OTPs can't be reused)

## 🎯 User Flow

1. User signs up → OTP email sent
2. User redirected to `/verify` page
3. User enters 6-digit OTP
4. OTP verified → User logged in
5. User can access all features

## 🐛 Troubleshooting

**OTP not received:**
- Check backend console logs (development)
- Check spam folder
- Use "Resend code" button
- Verify email service is configured (production)

**Invalid OTP:**
- Make sure you're using the latest OTP
- Check if OTP expired (10 minutes)
- Try resending a new code

**Email already verified:**
- User can login directly
- No need for verification

## ✨ Next Steps

1. Run the SQL schema in Supabase
2. Test the signup → verification flow
3. Configure email service for production
4. Customize email template if needed

Everything is ready! 🎉

