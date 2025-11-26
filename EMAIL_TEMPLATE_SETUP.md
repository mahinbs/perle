# 📧 Supabase Email Template Setup - Step by Step

## ✅ Answer to Your Questions

### 1. Do you need `otp_schema.sql`?
**NO - You can DELETE it!** ❌

Since we're using **Supabase Auth** (not custom OTP), you don't need:
- `email_otps` table
- Custom OTP schema
- `email_verified` column (Supabase handles this)

**Supabase Auth** manages everything automatically!

### 2. Will email signup only work once?
**YES!** ✅

Supabase Auth automatically prevents duplicate signups:
- If email already exists → Error: "User already registered"
- If email is verified → Can't sign up again
- If email exists but not verified → Can resend OTP

### 3. Where to put the beautiful email template?

Follow these exact steps:

## 🎯 Step-by-Step: Configure Email Template in Supabase

### Step 1: Go to Email Templates
1. Open your Supabase Dashboard: https://app.supabase.com
2. Select your project: **doudmnpxdymqyxwufqjo**
3. In the left sidebar, click **"Authentication"**
4. Click **"Email Templates"** (under Configuration section)

### Step 2: Select "Confirm signup" Template
1. You'll see a list of email templates
2. Click on **"Confirm signup"** template
3. This is the template that sends the 6-digit OTP

### Step 3: Edit the Template
1. You'll see two tabs: **"Source"** and **"Preview"**
2. Click on **"Source"** tab (this is where you edit the HTML)
3. You'll see the current template code

### Step 4: Replace with Beautiful Template

**Subject Line:**
```
Verify Your Email - SyntraIQ
```

**Body (HTML) - Copy this ENHANCED version:**

📄 **Full template is in `EMAIL_TEMPLATE_FINAL.html` - Copy from there!**

Or use this improved version:

### Step 5: Important - Use the Correct Variable

**CRITICAL:** Make sure you use `{{ .Token }}` (with a space) or `{{.Token}}` (without space) for the 6-digit OTP code.

Supabase will automatically replace `{{ .Token }}` with the actual 6-digit code when sending the email.

### Step 6: Preview and Save
1. Click **"Preview"** tab to see how it looks
2. If it looks good, click **"Save changes"** button (green button at bottom right)
3. Done! ✅

## 📍 Exact Location in Supabase Dashboard

```
Supabase Dashboard
  └── Your Project (doudmnpxdymqyxwufqjo)
      └── Authentication (left sidebar)
          └── Email Templates (under Configuration)
              └── Confirm signup (click on it)
                  └── Source tab (click here)
                      └── Paste the HTML template
                          └── Save changes
```

## 🔍 Visual Guide

The interface looks exactly like your image:
- **Left sidebar:** Authentication → Email Templates
- **Main area:** "Confirm signup" template selected
- **Tabs:** "Source" (for editing) and "Preview" (for viewing)
- **Bottom right:** "Save changes" button (green)

## ✅ What Happens Next

1. User signs up → Supabase Auth creates account
2. Supabase automatically sends email using your template
3. Email contains 6-digit code in beautiful format
4. User enters code on `/verify` page
5. Code verified → User logged in!

## 🎨 Template Features

- ✅ Beautiful gold gradient header
- ✅ Large 6-digit code display (monospace font)
- ✅ Matches SyntraIQ design colors
- ✅ Responsive (works on mobile)
- ✅ Professional footer

That's it! Just paste the template in Supabase Dashboard and save. 🚀

