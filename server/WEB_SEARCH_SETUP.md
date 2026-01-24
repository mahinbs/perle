# Web Search Integration Setup (Tavily AI)

## Overview

The system now includes **intelligent web search integration** using Tavily AI Search API. This allows the AI to provide **current, accurate information** about:
- Latest products and technology
- Recent news and events
- Current prices and market data
- New releases and announcements
- Real-time information

## How It Works

### 1. **Automatic Detection**
The system automatically detects when a query requires current information based on:
- **Keywords**: "latest", "newest", "current", "recent", "today", "2026", "2025", etc.
- **Topics**: phones, processors, technology, news, prices, etc.
- **Combinations**: Questions like "what is latest snapdragon" automatically trigger web search

### 2. **Web Search Execution**
When current info is needed:
- Tavily searches the web for the most relevant, recent information
- Returns top 5 results with titles, URLs, and content
- All results are from trusted, authoritative sources

### 3. **AI Context Enhancement**
Search results are automatically added to the AI's context:
- AI sees the latest web search results
- AI can cite sources in responses
- Responses are based on current, verified information

## Setup Instructions

### Step 1: Get Tavily API Key

1. Go to [https://tavily.com](https://tavily.com)
2. Sign up for a free account
3. Navigate to API keys section
4. Copy your API key

**Free Tier Includes:**
- 1,000 API requests per month
- Advanced search depth
- No credit card required

### Step 2: Add to Environment Variables

Add your Tavily API key to your server `.env` file:

```bash
# Tavily AI Search (for current information queries)
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 3: Restart Server

```bash
cd server
npm run dev  # Development mode
# OR
npm start    # Production mode
```

## Verification

Test with a query that requires current information:

```bash
curl -X POST http://localhost:5000/api/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "query": "what is latest snapdragon processor",
    "mode": "Ask",
    "model": "auto"
  }'
```

You should see:
- ✅ Console log: `🌐 Query requires current info - performing web search...`
- ✅ Console log: `✅ Found 5 web search results`
- ✅ Response contains current information (e.g., Snapdragon 8 Elite Gen 5)

## Query Examples That Trigger Web Search

### ✅ Will Use Web Search
- "what is latest snapdragon"
- "best phones in 2026"
- "current iPhone price"
- "recent AI developments"
- "newest laptop processors"
- "today's weather"
- "latest news on Tesla"

### ❌ Won't Use Web Search
- "what is photosynthesis" (general knowledge)
- "explain quantum mechanics" (scientific concept)
- "how to write a for loop" (programming basics)
- "history of World War 2" (historical fact)

## Features

### Smart Detection
- Analyzes query intent automatically
- Combines keyword and topic detection
- Only searches when necessary (saves API calls)

### Fast Performance
- Tavily returns results in ~1-2 seconds
- Advanced search depth for quality results
- Only 5 results to keep context focused

### All AI Models Supported
Web search works with:
- ✅ OpenAI (GPT-4o, GPT-4o-mini)
- ✅ Google Gemini (2.0 Flash, Lite)
- ✅ Anthropic Claude (4.5 Sonnet, Opus, Haiku)
- ✅ xAI Grok (Grok 3, 3 Mini)

### All Chat Modes Supported
- ✅ Normal Chat
- ✅ AI Friend
- ✅ AI Psychologist
- ✅ Spaces

## Troubleshooting

### Issue: "Tavily API key not configured"
**Solution:** Add `TAVILY_API_KEY` to your `.env` file and restart the server.

### Issue: Web search not triggering
**Solution:** Check console logs. If no `🌐 Query requires current info` message appears, the query may not match detection patterns. Try adding keywords like "latest", "current", "recent".

### Issue: Empty search results
**Possible causes:**
1. Query too vague - be more specific
2. API rate limit reached (1000/month on free tier)
3. Network issues - check internet connection

### Issue: Incorrect information still
**Solution:** 
- Web search fetches current results, but AI interpretation may vary
- Try rephrasing query to be more specific
- Use "Research" mode for more thorough analysis

## Rate Limits

**Tavily Free Tier:**
- 1,000 requests per month
- ~33 requests per day
- Resets monthly

**Optimization:**
- System only searches when needed (not every query)
- Typical usage: 10-30 searches per day for most apps
- Upgrade to paid tier if you need more (see [Tavily pricing](https://tavily.com/pricing))

## Advanced Configuration

### Customize Detection

Edit `/server/src/utils/webSearch.ts` to customize when web search triggers:

```typescript
// Add more keywords
const currentInfoIndicators = [
  'latest', 'newest', 'current', 'recent',
  'your-custom-keyword' // Add here
];

// Add more topics
const currentTopics = [
  'phone', 'laptop', 'processor',
  'your-custom-topic' // Add here
];
```

### Change Result Count

```typescript
// In aiProviders.ts, change maxResults parameter
const searchResults = await searchWeb(query, 10); // Get 10 results instead of 5
```

## Benefits

### ✅ Before Web Search Integration
- ❌ Outdated information (e.g., "Snapdragon 8 Gen 3" when Gen 5 exists)
- ❌ AI limited to training data cutoff
- ❌ No source citations for recent info
- ❌ User had to verify externally

### ✅ After Web Search Integration
- ✅ Current, accurate information (e.g., "Snapdragon 8 Elite Gen 5")
- ✅ AI has access to latest web data
- ✅ Cites authoritative sources
- ✅ User gets verified, up-to-date answers

## Support

For issues or questions:
- Check console logs for error messages
- Verify API key is correctly set
- Ensure server has internet access
- Test with simple query: "what is today's date"

## Next Steps

1. ✅ Get Tavily API key
2. ✅ Add to `.env`
3. ✅ Restart server
4. ✅ Test with "latest" queries
5. ✅ Monitor console logs
6. ✅ Enjoy current information! 🚀
