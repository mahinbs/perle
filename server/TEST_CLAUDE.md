# Test Claude Models

## Quick Test Commands

These commands will test all 4 Claude models. Make sure:
1. Server is running: `npm run dev`
2. You have a valid JWT token (login first)
3. User is premium
4. `CLAUDE_API_KEY` is set in `.env`

### Test 1: Claude 3.5 Sonnet (Latest)
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "Write a Python function to check if a number is prime",
    "model": "claude-3.5-sonnet",
    "mode": "Ask",
    "chatMode": "normal",
    "newConversation": true
  }'
```

Expected: Code with bullet points, professional response

---

### Test 2: Claude 3 Haiku (Fastest)
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "What is TypeScript?",
    "model": "claude-3-haiku",
    "mode": "Ask",
    "chatMode": "normal",
    "newConversation": true
  }'
```

Expected: Quick, concise response with bullet points

---

### Test 3: Claude 3 Opus (Most Advanced)
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "Explain the theory of relativity in simple terms",
    "model": "claude-3-opus",
    "mode": "Research",
    "chatMode": "normal",
    "newConversation": true
  }'
```

Expected: Detailed, well-structured response with bullet points

---

### Test 4: Claude 3 Sonnet (Balanced)
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "List the planets in our solar system",
    "model": "claude-3-sonnet",
    "mode": "Ask",
    "chatMode": "normal",
    "newConversation": true
  }'
```

Expected: Well-organized list with bullet points

---

## Test AI Friend Mode (should use natural language, no bullets unless asked)
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "Hey, how are you doing today?",
    "model": "claude-3.5-sonnet",
    "mode": "Ask",
    "chatMode": "ai_friend",
    "newConversation": true
  }'
```

Expected: Friendly, conversational response (NO bullet points)

---

## Test AI Psychologist Mode
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "I feel stressed about work lately",
    "model": "claude-3.5-sonnet",
    "mode": "Ask",
    "chatMode": "ai_psychologist",
    "newConversation": true
  }'
```

Expected: Empathetic, supportive response (NO bullet points unless asked)

---

## Expected Success Response Format
```json
{
  "success": true,
  "result": {
    "sources": [],
    "chunks": [
      {
        "text": "Your answer here...",
        "citationIds": []
      }
    ],
    "query": "Your question",
    "mode": "Ask",
    "timestamp": 1234567890
  }
}
```

## Common Errors

### Error 1: Missing API Key
```json
{
  "success": false,
  "error": "CLAUDE_API_KEY_MISSING: Please set CLAUDE_API_KEY in .env"
}
```
**Fix**: Add `CLAUDE_API_KEY=sk-ant-api03-xxxxx` to `.env`

### Error 2: Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized"
}
```
**Fix**: Use a valid JWT token in Authorization header

### Error 3: Not Premium
```json
{
  "success": false,
  "error": "Premium subscription required"
}
```
**Fix**: Upgrade user to premium in database

### Error 4: Rate Limit
```json
{
  "success": false,
  "error": "Rate limit exceeded"
}
```
**Fix**: Wait a moment and try again

---

## How to Get JWT Token

1. **Login**:
```bash
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "yourpassword"
  }'
```

2. **Copy the token** from response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

3. **Use in tests**: Replace `YOUR_JWT_TOKEN` with the actual token

---

## Verifying Integration

✅ **Backend Files Modified**:
- `server/src/types.ts` - Added Claude model types
- `server/src/utils/aiProviders.ts` - Added `generateClaudeAnswer()` function
- `server/src/routes/chat.ts` - Added Claude models to schema

✅ **Frontend Files Modified**:
- `src/types/index.ts` - Added Claude model types
- `src/components/LLMModelSelector.tsx` - Added Claude models to dropdown

✅ **Environment**:
- `CLAUDE_API_KEY` added to `.env`
- `@anthropic-ai/sdk` package installed
- Server rebuilt successfully

---

**All Claude models are now available for premium users in normal chat mode!** 🎉

