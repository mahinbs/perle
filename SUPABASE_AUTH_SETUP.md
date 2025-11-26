# 🔐 Supabase Auth Setup Guide

This guide shows you how to configure Supabase Auth with beautiful email templates for 6-digit OTP verification.

## ✅ What We're Using

- **Supabase Auth** for signup/login
- **Supabase Email Templates** for beautiful OTP emails
- **6-digit OTP** verification flow
- **Custom verification page** matching your UI

## 🚀 Setup Steps

### Step 1: Configure Supabase Auth Settings

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Settings**
3. Enable **Email Auth**
4. Set **Email Template** to use OTP (6-digit code)

### Step 2: Configure Email Template in Supabase

1. In Supabase Dashboard, go to **Authentication** → **Email Templates**
2. Select **"Confirm signup"** template
3. Click on **"Source"** tab (as shown in your image)

#### Subject Line:
```
Verify Your Email - SyntraIQ
```

#### Email Body (HTML):
Copy and paste this beautiful template:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - SyntraIQ</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F8F7F4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #F8F7F4; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #C7A869 0%, #B8955A 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #FFFFFF; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                SyntraIQ
              </h1>
              <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">
                Elegant AI Search
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #111111; font-size: 24px; font-weight: 600;">
                Verify Your Email Address
              </h2>
              
              <p style="margin: 0 0 30px 0; color: #4B4B4B; font-size: 16px; line-height: 1.6;">
                Hi {{ .UserMetaData.name }},
              </p>
              
              <p style="margin: 0 0 30px 0; color: #4B4B4B; font-size: 16px; line-height: 1.6;">
                Welcome to SyntraIQ! To complete your signup, please verify your email address using the 6-digit code below:
              </p>
              
              <!-- OTP Code Box -->
              <table role="presentation" style="width: 100%; margin: 30px 0;">
                <tr>
                  <td align="center">
                    <div style="background: linear-gradient(135deg, #C7A869 0%, #B8955A 100%); border-radius: 12px; padding: 30px; text-align: center; box-shadow: 0 4px 12px rgba(199, 168, 105, 0.3);">
                      <p style="margin: 0 0 15px 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">
                        Your Verification Code
                      </p>
                      <div style="display: inline-block; background-color: #FFFFFF; border-radius: 8px; padding: 20px 40px; margin: 10px 0;">
                        <p style="margin: 0; color: #C7A869; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                          {{ .Token }}
                        </p>
                      </div>
                      <p style="margin: 20px 0 0 0; color: rgba(255, 255, 255, 0.8); font-size: 12px;">
                        This code expires in 10 minutes
                      </p>
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0 0; color: #4B4B4B; font-size: 14px; line-height: 1.6;">
                If you didn't create an account with SyntraIQ, you can safely ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #F8F7F4; border-top: 1px solid #EBE8E1; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #4B4B4B; font-size: 12px;">
                © 2024 SyntraIQ. All rights reserved.
              </p>
              <p style="margin: 0; color: #4B4B4B; font-size: 12px;">
                This is an automated email, please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

**Important Variables:**
- `{{ .Token }}` - The 6-digit OTP code (use this in the template)
- `{{ .UserMetaData.name }}` - User's name
- `{{ .Email }}` - User's email
- `{{ .SiteURL }}` - Your site URL

### Step 3: Enable OTP in Supabase

1. Go to **Authentication** → **Settings** → **Auth Providers**
2. Make sure **Email** is enabled
3. Under **Email Auth**, set:
   - **Enable email confirmations**: ON
   - **Secure email change**: ON (optional)

### Step 4: Configure OTP Settings

In Supabase Dashboard:
1. Go to **Authentication** → **Settings**
2. Find **"OTP Settings"** or **"Email OTP"**
3. Enable **6-digit OTP** (instead of magic links)
4. Set expiration time to **10 minutes**

### Step 5: Test the Flow

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
   - Fill in details
   - Submit
   - Check your email for the 6-digit code
   - Enter code on verification page

## 📧 Email Template Variables

Supabase provides these variables you can use:

- `{{ .Token }}` - **6-digit OTP code** (use this!)
- `{{ .ConfirmationURL }}` - Confirmation link (if using links)
- `{{ .Email }}` - User's email address
- `{{ .SiteURL }}` - Your site URL
- `{{ .UserMetaData.name }}` - User's name (from signup)
- `{{ .RedirectTo }}` - Redirect URL after verification

## 🎨 Template Features

- ✅ Beautiful gold gradient header matching SyntraIQ design
- ✅ Large, readable 6-digit code display
- ✅ Professional styling
- ✅ Responsive design
- ✅ Clear expiration notice
- ✅ Branded footer

## 🔧 Backend Changes

The backend now uses:
- `supabase.auth.signUp()` - Creates user and sends OTP email
- `supabase.auth.verifyOtp()` - Verifies 6-digit code
- `supabase.auth.resend()` - Resends OTP code
- `supabase.auth.signInWithPassword()` - Login

All email sending is handled by Supabase automatically!

## ✅ Benefits

1. **No custom email service needed** - Supabase handles it
2. **Beautiful templates** - Customize in dashboard
3. **Automatic email sending** - No backend code needed
4. **Secure** - Supabase handles OTP generation and validation
5. **Easy to update** - Change template in dashboard anytime

## 🐛 Troubleshooting

**OTP not received:**
- Check Supabase email logs in dashboard
- Verify email template is saved
- Check spam folder
- Verify OTP is enabled in settings

**Template not showing:**
- Make sure you're using `{{ .Token }}` for the code
- Check template is saved in "Source" tab
- Preview the template before saving

**Code not working:**
- Verify OTP type is set to 'signup' in backend
- Check code hasn't expired (10 minutes)
- Try resending code

Everything is now handled by Supabase Auth! 🎉

