# 🚀 Complete Setup Guide for Perlé

This guide will help you set up the backend with Supabase and connect the frontend.

## ✅ Step 1: Environment Files

### Backend Environment (`server/.env`)

Create `server/.env` file with:

```env
# Server Configuration
PORT=3333
CORS_ORIGIN=http://localhost:3000

# Supabase Configuration
SUPABASE_URL=https://doudmnpxdymqyxwufqjo.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvdWRtbnB4ZHltcXl4d3VmcWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NTc5ODUsImV4cCI6MjA3ODMzMzk4NX0.IKiQcAy6QeMabfmKur149Daxcw96Fcsehnruqwvyr4c

# Use service role key for backend operations (bypasses RLS)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvdWRtbnB4ZHltcXl4d3VmcWpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjc1Nzk4NSwiZXhwIjoyMDc4MzMzOTg1fQ.7CDTZx8wf8rFLNxBC1klP1jN9v0DaesrLxsFoC251zc

# OpenAI Configuration (Optional - leave empty to use fallback)
# OPENAI_API_KEY=your-openai-api-key-here
```

### Frontend Environment (`.env` in root)

Create `.env` file in the root directory:

```env
VITE_API_URL=http://localhost:3333
```

## ✅ Step 2: Install Dependencies

### Backend Dependencies

```bash
cd server
npm install
```

### Frontend Dependencies (if not already installed)

```bash
# From root directory
npm install
```

## ✅ Step 3: Database Setup

You've already run the SQL schema in Supabase! ✅

The schema creates:
- `users` table
- `sessions` table  
- `user_profiles` table
- `search_history` table
- `library_items` table

All with proper indexes and RLS policies.

## ✅ Step 4: Start the Backend

```bash
# From server directory
npm run dev

# OR from root directory
npm run server:dev
```

You should see:
```
🚀 Perlé backend listening on http://localhost:3333
📡 CORS enabled for: http://localhost:3000
```

## ✅ Step 5: Start the Frontend

In a **new terminal**, from the root directory:

```bash
npm run dev
```

The frontend will start on `http://localhost:3000`

## ✅ Step 6: Test the Setup

1. **Test Backend Health:**
   - Open: `http://localhost:3333/api/health`
   - Should return: `{"ok":true,"service":"perle-backend","version":"1.0.0","port":3333}`

2. **Test Frontend:**
   - Open: `http://localhost:3000`
   - Navigate to Profile page
   - Try signing up with a new account
   - Try logging in

## 🎯 What's Connected

### ✅ Authentication
- Sign up creates user in Supabase
- Login creates session token
- Profile settings saved to database
- Logout clears session

### ✅ Search
- Search queries saved to database (if authenticated)
- Search history fetched from database
- OpenAI integration (if API key provided)
- Fallback to local answer engine

### ✅ Profile
- Settings synced with database
- Profile updates saved to Supabase
- Account deletion removes all user data

### ✅ Library
- Library items saved to database
- CRUD operations work with Supabase
- User-specific data isolation

## 🔧 Troubleshooting

### Backend won't start
- Check `server/.env` file exists and has correct values
- Make sure port 3333 is not in use
- Check Supabase credentials are correct

### Frontend can't connect to backend
- Verify `VITE_API_URL=http://localhost:3333` in root `.env`
- Make sure backend is running on port 3333
- Check browser console for CORS errors

### Database errors
- Verify SQL schema was run in Supabase
- Check Supabase project is active
- Verify service role key is correct

### Authentication not working
- Check Supabase tables exist
- Verify password requirements (min 6 chars, uppercase, lowercase, number)
- Check browser console for errors

## 📝 Password Requirements

For signup, passwords must:
- Be at least 6 characters
- Contain at least one uppercase letter
- Contain at least one lowercase letter
- Contain at least one number

## 🎉 You're All Set!

Your app is now fully connected to Supabase with:
- ✅ Real authentication
- ✅ Database persistence
- ✅ User profiles
- ✅ Search history
- ✅ Library items
- ✅ Optional OpenAI integration

Happy coding! 🚀

