# Chat Modes Feature Guide

## Overview

Perle now supports **3 distinct chat modes**, each with completely separate chat histories and unique conversation styles:

### 1. 🔍 Normal Chat Mode (`normal`)
- **Purpose**: Traditional search-style answers with citations, structure, and references
- **Style**: Professional, informative, well-structured with bullet points
- **Features**:
  - Answers organized in clear bullet points
  - Structured information with numbered lists when appropriate
  - Reference links and citations (like Perplexity)
  - Images and source citations where available
  - Perfect for research and information gathering

### 2. 💬 AI Friend Mode (`ai_friend`)
- **Purpose**: Casual, friendly conversation like chatting with a real human friend
- **Style**: Warm, empathetic, conversational, and supportive
- **Features**:
  - Natural, casual language (like texting a friend)
  - Empathetic and understanding responses
  - Follow-up questions to show genuine interest
  - Encouraging and positive tone
  - Occasional emojis for warmth
  - Remembers conversation context
  - No formal structure - just natural dialogue

### 3. 🧠 AI Psychologist Mode (`ai_psychologist`)
- **Purpose**: Professional psychological support and guidance
- **Style**: Professional, empathetic, therapeutic
- **Features**:
  - Active listening techniques
  - Non-judgmental and validating
  - Thoughtful questions to explore feelings
  - Evidence-based insights when appropriate
  - Clear points when giving advice
  - Professional boundaries maintained
  - Helps develop coping strategies
  - Builds self-awareness

## Key Features

### Completely Separate Chat Histories
- Each mode maintains its **own isolated conversation history**
- Switching between modes won't mix conversations
- History is stored per-user AND per-mode in the database
- Clearing history in one mode doesn't affect other modes

### History Limits
- **Free Users**: Last 5 messages per mode
- **Premium Users**: Last 20 messages per mode

### Mode-Specific AI Behavior
- Each mode uses a specialized system prompt
- AI personality and response style adapts to the mode
- Normal mode: Structured and informative
- AI Friend mode: Casual and conversational
- AI Psychologist mode: Professional and therapeutic

## API Usage

### Sending a Message

**Endpoint**: `POST /api/chat`

**Request Body**:
```json
{
  "message": "Your message here",
  "model": "gemini-lite",
  "chatMode": "normal",
  "newConversation": false
}
```

**Chat Mode Options**:
- `"normal"` (default) - Standard informative answers
- `"ai_friend"` - Casual friendly chat
- `"ai_psychologist"` - Psychological support

**Example Requests**:

```json
// Normal mode (research/information)
{
  "message": "What are the benefits of meditation?",
  "chatMode": "normal"
}

// AI Friend mode (casual chat)
{
  "message": "I had a really tough day at work today",
  "chatMode": "ai_friend"
}

// AI Psychologist mode (support)
{
  "message": "I've been feeling anxious about my upcoming presentation",
  "chatMode": "ai_psychologist"
}
```

### Getting Chat History

**Endpoint**: `GET /api/chat/history?chatMode=normal`

**Query Parameters**:
- `chatMode`: `"normal"`, `"ai_friend"`, or `"ai_psychologist"`

**Response**:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": "2025-12-29T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help you today?",
      "timestamp": "2025-12-29T10:00:01Z"
    }
  ]
}
```

### Starting a New Conversation

To clear the history for a specific mode and start fresh:

```json
{
  "message": "Let's start over",
  "chatMode": "ai_friend",
  "newConversation": true
}
```

This will **only clear the history for that specific mode**, not the others.

## Database Schema

The `conversation_history` table includes a `chat_mode` field:

```sql
chat_mode TEXT NOT NULL DEFAULT 'normal'
-- Values: 'normal', 'ai_friend', 'ai_psychologist'
```

### Running the Migration

To add chat mode support to your existing database:

```bash
# Navigate to your Supabase SQL Editor and run:
cat server/database/add_chat_mode.sql
```

Or execute the SQL directly in your Supabase dashboard.

## Frontend Integration

### Example: Switching Chat Modes

```typescript
// State to track current chat mode
const [chatMode, setChatMode] = useState<'normal' | 'ai_friend' | 'ai_psychologist'>('normal');

// Send message with appropriate mode
const sendMessage = async (message: string) => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      chatMode, // Use current mode
      model: 'gemini-lite'
    })
  });
  
  const data = await response.json();
  return data.message;
};

// Fetch history for specific mode
const loadHistory = async (mode: string) => {
  const response = await fetch(`/api/chat/history?chatMode=${mode}`);
  const data = await response.json();
  return data.messages;
};
```

### UI Recommendations

Consider adding:
1. **Mode Selector**: Toggle between the 3 modes (tabs or dropdown)
2. **Visual Indicators**: Different colors/icons for each mode
3. **Mode-Specific UI**: 
   - Normal: Show citations and structured layout
   - AI Friend: More casual, chat-bubble style
   - AI Psychologist: Calm, professional design
4. **Clear Mode Label**: Always show which mode the user is in

## Use Cases

### Normal Mode
- Research questions
- Technical information
- Comparisons and analysis
- Fact-finding
- Learning new topics

### AI Friend Mode
- Casual conversation
- Sharing daily experiences
- Getting encouragement
- Brainstorming ideas
- Just chatting about life

### AI Psychologist Mode
- Managing stress and anxiety
- Processing emotions
- Working through challenges
- Building coping strategies
- Self-reflection and growth

## Best Practices

1. **Clear Mode Switching**: Make it obvious to users which mode they're in
2. **Preserve Context**: Each mode remembers its own conversation
3. **Appropriate Use**: Guide users to use the right mode for their needs
4. **Privacy**: Remind users that AI psychologist is supportive but not a replacement for professional therapy
5. **Model Selection**: All modes work with any AI model (GPT, Gemini, Grok, etc.)

## Technical Notes

- Chat modes are isolated at the database level
- Each mode has its own conversation history
- Premium users get 4x more history (20 vs 5 messages)
- All AI providers (OpenAI, Gemini, Grok) support all chat modes
- System prompts are automatically adjusted based on mode
- No cross-contamination between modes

## Example Flow

```
User opens app → Selects "AI Friend" mode
  ↓
User: "Hey, I just got a promotion!"
  ↓
AI (Friend): "That's amazing! Congratulations! 🎉 I'm so proud of you! 
How are you feeling about it? Tell me everything!"
  ↓
[Later, user switches to "Normal" mode - fresh conversation]
  ↓
User: "What are the key responsibilities of a senior engineer?"
  ↓
AI (Normal): "Key responsibilities of a senior engineer include:
• Technical leadership and architecture decisions
• Mentoring junior engineers
• Code review and quality assurance
..."
```

## Support

For questions or issues with chat modes:
1. Check that the database migration has been run
2. Verify the `chat_mode` field exists in `conversation_history` table
3. Ensure frontend is passing the correct `chatMode` parameter
4. Check server logs for any errors

---

**Version**: 1.0  
**Last Updated**: December 29, 2025


