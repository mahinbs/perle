# Email Template Guide - Gmail Compatibility

## Problem
Gmail has very strict HTML/CSS support and strips out many modern CSS features. Your beautiful email template might look perfect in Supabase preview but break in Gmail.

## What Gmail Doesn't Support

❌ **NOT Supported:**
- `display: flex` / Flexbox
- `position: absolute` / `position: relative`
- CSS gradients (limited support)
- `box-shadow`
- Complex `border-radius` (basic support only)
- `<style>` tags in `<head>` (Gmail strips these)
- Many CSS3 properties

✅ **Supported:**
- Table-based layouts
- Inline styles
- Basic colors (`background-color`, `color`)
- Basic `border-radius` (simple values)
- `padding`, `margin` (limited)
- `font-size`, `font-weight`, `line-height`
- Basic `border` styles

## Solution

I've created a Gmail-compatible version (`EMAIL_TEMPLATE_GMAIL_COMPATIBLE.html`) that:

1. **Uses table-based layout** instead of flexbox
2. **Removes all absolute positioning** (no decorative circles)
3. **Uses solid colors** instead of gradients
4. **Removes box-shadows** (not supported)
5. **All styles are inline** (Gmail requirement)
6. **Simplified border-radius** (basic values only)
7. **Uses tables for layout** (most reliable in email)

## How to Use

1. Copy the content from `EMAIL_TEMPLATE_GMAIL_COMPATIBLE.html`
2. Go to Supabase Dashboard → Authentication → Emails → "Confirm sign up"
3. Paste the HTML in the "Body" field (Source tab)
4. The template uses `{{ .Token }}` which Supabase will replace with the actual OTP code

## Key Changes Made

### Before (Not Gmail-Compatible):
- Used `display: flex` ❌
- Used `position: absolute` for decorative elements ❌
- Used CSS gradients ❌
- Used `box-shadow` ❌
- Complex nested divs ❌

### After (Gmail-Compatible):
- Uses `<table>` for all layouts ✅
- All styles are inline ✅
- Solid colors only ✅
- Simple border-radius ✅
- Table-based structure ✅

## Testing

After updating the template:
1. Send a test email to yourself
2. Check in Gmail (web and mobile)
3. Check in other email clients (Outlook, Apple Mail, etc.)
4. Verify the OTP code displays correctly

## Notes

- The template still looks beautiful but uses email-safe HTML
- Colors match your brand (#C7A869 gold accent)
- All text is readable and properly formatted
- Works across all major email clients

