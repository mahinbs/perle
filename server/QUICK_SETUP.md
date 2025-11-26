# Quick API Keys Setup

## Add Your API Keys

### For Local Development

Create a `.env` file in the `server/` directory with your API keys:

```env
# Supabase (use your existing values)
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# OpenAI API Key (for premium users - GPT-5, GPT-4o, GPT-4o Mini, GPT-4 Turbo)
OPENAI_API_KEY=your-openai-api-key-here

# xAI API Key (for premium users - Grok 4, Grok Beta)
XAI_API_KEY=your-xai-api-key-here

# Google API Keys
GOOGLE_API_KEY=your-google-api-key          # For premium users (Gemini 2.0 Latest)
GOOGLE_API_KEY_FREE=your-google-api-key-free-here     # For free users (Gemini Lite)

# Anthropic API Key (for premium users - Claude 4.5)
ANTHROPIC_API_KEY=your-anthropic-api-key

# Server
PORT=3333
CORS_ORIGIN=http://localhost:3000
```

### For Production (Supabase Edge Functions)

Add these as secrets in Supabase:

1. Go to **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**
2. Add the following secrets:

```
OPENAI_API_KEY=your-openai-api-key-here
XAI_API_KEY=your-xai-api-key-here
GOOGLE_API_KEY_FREE=your-google-api-key-free-here
```

## Available Models for Premium Users

Premium users can now choose from:

### OpenAI Models
- **GPT-5** (uses GPT-4o)
- **GPT-4o**
- **GPT-4o Mini**
- **GPT-4 Turbo**
- **GPT-4** (legacy)
- **GPT-3.5 Turbo** (legacy)

### xAI Grok Models
- **Grok 3** - Flagship model for enterprise tasks
- **Grok 3 Mini** - Lightweight reasoning model
- **Grok 4** - Latest Grok model
- **Grok 4 Heavy** - Most powerful for complex tasks
- **Grok 4 Fast** - Cost-efficient with 2M token context
- **Grok Code Fast 1** - Specialized for agentic coding
- **Grok Beta** - Beta model with real-time capabilities

### Google Gemini Models
- **Gemini 2.0 Latest** (premium only)

### Anthropic Claude Models
- **Claude 4.5** (premium only)

### Auto Mode
- **Auto** - Automatically uses Gemini Lite (cost-effective)

## Restart Required

After adding the API keys, **restart your backend server** for the changes to take effect.

```bash
cd server
npm run dev
```
