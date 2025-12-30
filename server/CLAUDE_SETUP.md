# Claude (Anthropic) Model Integration

## Overview
Claude models from Anthropic are now integrated into SyntraIQ! Premium users can access all Claude models in normal chat mode through the model selector dropdown.

## Available Models

### Claude 3.5 Sonnet (Latest & Recommended)
- **Model ID**: `claude-3.5-sonnet`
- **API Model**: `claude-3-5-sonnet-20241022`
- **Best For**: Complex tasks, coding, advanced reasoning, and analysis
- **Context**: 200K tokens
- **Capabilities**: Fast, intelligent, excellent for coding and detailed analysis

### Claude 3 Opus
- **Model ID**: `claude-3-opus`
- **API Model**: `claude-3-opus-20240229`
- **Best For**: Top-level performance for demanding tasks
- **Context**: 200K tokens
- **Capabilities**: Advanced reasoning, multimodal, excellent for complex analysis

### Claude 3 Sonnet
- **Model ID**: `claude-3-sonnet`
- **API Model**: `claude-3-sonnet-20240229`
- **Best For**: Balanced performance and speed
- **Context**: 200K tokens
- **Capabilities**: Efficient, balanced, multimodal

### Claude 3 Haiku
- **Model ID**: `claude-3-haiku`
- **API Model**: `claude-3-haiku-20240307`
- **Best For**: Fast responses and high throughput
- **Context**: 200K tokens
- **Capabilities**: Fastest Claude model, cost-effective, lightweight

## Environment Setup

### Required Environment Variable
Add your Claude API key to the `.env` file:

```bash
CLAUDE_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Alternative Variable Names** (for backward compatibility):
- `ANTHROPIC_API_KEY` (will also work)

### How to Get API Key

1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in to your account
3. Navigate to "API Keys" section
4. Create a new API key
5. Copy the key and add it to your `.env` file

## Integration Details

### Backend Implementation
- **File**: `server/src/utils/aiProviders.ts`
- **Function**: `generateClaudeAnswer()`
- **Features**:
  - Supports conversation history (last 10 messages)
  - Chat mode-aware (normal, ai_friend, ai_psychologist)
  - Self-referential query detection (returns SyntraIQ info)
  - 15-second timeout protection
  - Token limit based on chat mode

### Model Selection Logic
```typescript
if (model === 'claude-3.5-sonnet') {
  claudeModel = 'claude-3-5-sonnet-20241022';
} else if (model === 'claude-3-opus') {
  claudeModel = 'claude-3-opus-20240229';
} else if (model === 'claude-3-sonnet') {
  claudeModel = 'claude-3-sonnet-20240229';
} else if (model === 'claude-3-haiku') {
  claudeModel = 'claude-3-haiku-20240307';
}
```

### Frontend Integration
- **Model Selector**: `src/components/LLMModelSelector.tsx`
- **Types**: `src/types/index.ts` and `server/src/types.ts`
- **Display**: All Claude models appear in the dropdown for premium users
- **Provider Color**: Orange (`#D97706`) for Anthropic branding

## Chat Mode Behavior

### Normal Chat Mode
- **System Prompt**: Structured, bullet-point focused
- **Response Style**: Professional, cited, organized
- **Token Limit**: 800 tokens

### AI Friend Mode
- **System Prompt**: Casual, friendly, conversational
- **Response Style**: Natural, warm, engaging
- **Token Limit**: 1000 tokens

### AI Psychologist Mode
- **System Prompt**: Empathetic, supportive, professional
- **Response Style**: Compassionate, understanding, therapeutic
- **Token Limit**: 1200 tokens

## API Testing

### Test Claude 3.5 Sonnet
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "Explain quantum computing in simple terms",
    "model": "claude-3.5-sonnet",
    "mode": "Ask",
    "chatMode": "normal",
    "newConversation": false
  }'
```

### Test Claude 3 Opus
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "Write a Python function to calculate Fibonacci numbers",
    "model": "claude-3-opus",
    "mode": "Ask",
    "chatMode": "normal",
    "newConversation": false
  }'
```

### Test Claude 3 Haiku (Fastest)
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "What is the capital of France?",
    "model": "claude-3-haiku",
    "mode": "Ask",
    "chatMode": "normal",
    "newConversation": false
  }'
```

## Error Handling

### Missing API Key
```json
{
  "success": false,
  "error": "CLAUDE_API_KEY_MISSING: Please set CLAUDE_API_KEY in .env"
}
```

### Timeout Error
If Claude API doesn't respond within 15 seconds, a timeout error is thrown.

### Empty Response
If Claude returns an empty response, an error is thrown with appropriate message.

## Pricing Considerations

### Claude 3.5 Sonnet
- **Input**: $3.00 per million tokens
- **Output**: $15.00 per million tokens

### Claude 3 Opus
- **Input**: $15.00 per million tokens
- **Output**: $75.00 per million tokens

### Claude 3 Sonnet
- **Input**: $3.00 per million tokens
- **Output**: $15.00 per million tokens

### Claude 3 Haiku
- **Input**: $0.25 per million tokens
- **Output**: $1.25 per million tokens

**Recommendation**: Use Claude 3.5 Sonnet or Claude 3 Haiku for most tasks. Use Opus only for the most demanding analysis tasks.

## Feature Access

### Free Users
- **No Access**: Cannot select Claude models
- **Upgrade Prompt**: Will see "Upgrade Plan" button in model selector

### Premium Users (Pro & Max)
- **Full Access**: All Claude models available in dropdown
- **Normal Chat Only**: Claude models only available in normal chat mode
- **AI Friend/Psychologist**: Use OpenAI, Gemini, or Grok models

## Best Practices

1. **Use Claude 3.5 Sonnet for coding tasks** - It's optimized for code generation and analysis
2. **Use Claude 3 Haiku for quick questions** - Fastest and most cost-effective
3. **Use Claude 3 Opus for complex analysis** - Best for research, legal, or medical tasks
4. **Enable conversation history** - Claude benefits from context
5. **Keep prompts clear** - Claude responds well to structured questions

## Troubleshooting

### Claude not appearing in dropdown
- Ensure you're a premium user
- Check that you're in "normal chat" mode
- Verify API key is set in `.env`
- Rebuild the server: `npm run build`

### API errors
- Check API key is valid and active
- Verify you have credits in your Anthropic account
- Check console logs for detailed error messages
- Ensure you're not hitting rate limits

### Slow responses
- Claude models typically respond in 2-5 seconds
- Network latency may affect response time
- Consider using Claude 3 Haiku for faster responses

## Additional Resources

- [Anthropic API Docs](https://docs.anthropic.com/)
- [Claude Model Comparison](https://www.anthropic.com/claude)
- [Rate Limits](https://docs.anthropic.com/claude/reference/rate-limits)
- [Best Practices](https://docs.anthropic.com/claude/docs/guide-to-anthropics-prompt-engineering-resources)

---

**Integration Complete**: Claude models are fully integrated and ready to use! 🎉

