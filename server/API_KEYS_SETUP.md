# API Keys Setup for Supabase Edge Functions

This document explains how to set up API keys for all AI models in Supabase Edge Function secrets.

## 🔐 Required API Keys

You need to set up API keys for the following providers:

1. **OpenAI** - For GPT-5, GPT-4, GPT-3.5 Turbo
2. **Google** - For Gemini 2.0 Latest, Gemini Lite
   - `GOOGLE_API_KEY` - For premium users (Gemini 2.0 Latest)
   - `GOOGLE_API_KEY_FREE` - For free users (Gemini Lite) - **Required**
3. **Anthropic** - For Claude 4.5
4. **xAI** - For Grok 4

## 📝 Setting Up Secrets in Supabase

### Option 1: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Project Settings** → **Edge Functions** → **Secrets**
3. Add the following secrets:

```
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...          # For premium users (Gemini 2.0 Latest)
GOOGLE_API_KEY_FREE=...     # For free users (Gemini Lite) - REQUIRED
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=...
```

### Option 2: Using Supabase CLI

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Set secrets
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set GOOGLE_API_KEY=...          # For premium users
supabase secrets set GOOGLE_API_KEY_FREE=...    # For free users - REQUIRED
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set XAI_API_KEY=...
```

## 🔑 Getting API Keys

### OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key (starts with `sk-`)

### Google API Key (Gemini)
1. Go to https://aistudio.google.com/app/apikey
2. Create a new API key
3. Copy the key

### Anthropic API Key (Claude)
1. Go to https://console.anthropic.com/
2. Navigate to API Keys
3. Create a new API key
4. Copy the key (starts with `sk-ant-`)

### xAI API Key (Grok)
1. Go to https://console.x.ai/
2. Navigate to API Keys
3. Create a new API key
4. Copy the key

## 🚀 Using in Local Development

For local development, create a `.env` file in the `server/` directory:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# AI Provider API Keys
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...          # For premium users (Gemini 2.0 Latest)
GOOGLE_API_KEY_FREE=...     # For free users (Gemini Lite) - REQUIRED
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=...

# Server
PORT=3333
CORS_ORIGIN=http://localhost:3000
```

## 📋 Model-to-Provider Mapping

| Model | Provider | API Key Required |
|-------|----------|----------------|
| GPT-5 | OpenAI | `OPENAI_API_KEY` |
| Gemini 2.0 Latest | Google | `GOOGLE_API_KEY` (premium) |
| Gemini Lite | Google | `GOOGLE_API_KEY_FREE` (free) or `GOOGLE_API_KEY` (fallback) |
| Claude 4.5 | Anthropic | `ANTHROPIC_API_KEY` |
| Grok 4 | xAI | `XAI_API_KEY` |
| Auto | Google (Gemini Lite) | `GOOGLE_API_KEY_FREE` (free) or `GOOGLE_API_KEY` (premium) |

## ⚠️ Important Notes

1. **Free Users**: Always use Gemini Lite (requires `GOOGLE_API_KEY_FREE`)
   - If `GOOGLE_API_KEY_FREE` is not set, it will fallback to `GOOGLE_API_KEY`
   - **You must set `GOOGLE_API_KEY_FREE` for free users to work properly**
2. **Premium Users**: Can use any model, but the corresponding API key must be set
   - Premium users use `GOOGLE_API_KEY` for Gemini 2.0 Latest
   - Premium users in "auto" mode use `GOOGLE_API_KEY_FREE` (or `GOOGLE_API_KEY` as fallback)
3. **Fallback**: If an API key is missing, the system falls back to a local answer generator
4. **Security**: Never commit API keys to version control. Always use environment variables or Supabase secrets.

## 🔄 Updating Secrets

If you need to update a secret:

```bash
# Using Supabase CLI
supabase secrets set OPENAI_API_KEY=new-key-here

# Or via Dashboard: Project Settings → Edge Functions → Secrets → Edit
```

## ✅ Verification

To verify your secrets are set correctly:

1. Check Supabase Dashboard → Edge Functions → Secrets
2. Test each model in your application
3. Check server logs for any "API_KEY_MISSING" errors

