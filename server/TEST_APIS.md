# Backend API Testing Guide

Test all 3 chat modes and media generation endpoints.

## Base URL
```
http://localhost:3333/api
```

---

## 1. Normal Chat Mode (Bullet Points)

### Test Request
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the benefits of meditation?",
    "chatMode": "normal",
    "model": "gemini-lite"
  }'
```

### Expected Response
```json
{
  "message": "Brief overview of meditation benefits.\n\nKey benefits:\n• Reduces stress and anxiety\n• Improves focus and concentration\n• Enhances emotional well-being\n  - Better mood regulation\n  - Increased self-awareness\n• Physical health improvements\n• Better sleep quality",
  "model": "gemini-lite",
  "images": [],
  "sources": []
}
```

**✅ Should have:** Bullet points (•), structured format, clear sections

---

## 2. AI Friend Mode (Natural Conversation)

### Test Request
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hey! I just got promoted at work today!",
    "chatMode": "ai_friend",
    "model": "gemini-lite"
  }'
```

### Expected Response
```json
{
  "message": "Omg that's AMAZING!! 🎉 Congratulations! I'm so happy for you! How are you feeling? Tell me everything! This is such a big deal and you totally deserve it! What does the new role look like?",
  "model": "gemini-lite",
  "images": [],
  "sources": []
}
```

**✅ Should have:** Natural, casual language like a friend texting. NO bullet points. Emojis okay. Enthusiastic tone.

---

## 3. AI Psychologist Mode (Therapeutic)

### Test Request
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I have been feeling really anxious about my upcoming presentation",
    "chatMode": "ai_psychologist",
    "model": "gemini-lite"
  }'
```

### Expected Response
```json
{
  "message": "I hear that you're experiencing anxiety about your presentation, and that's a very common and understandable response to a potentially stressful situation. Let's explore this together. Can you tell me more about what specifically makes you feel anxious? Is it the content, the audience, or perhaps the fear of judgment? Understanding the root of your anxiety can help us develop strategies to manage it effectively.",
  "model": "gemini-lite",
  "images": [],
  "sources": []
}
```

**✅ Should have:** Professional, empathetic, therapeutic tone. Natural conversation. NO bullet points (unless giving specific coping steps when asked).

---

## 4. Get Chat History (Separate by Mode)

### Normal Mode History
```bash
curl -X GET "http://localhost:3333/api/chat/history?chatMode=normal"
```

### AI Friend Mode History
```bash
curl -X GET "http://localhost:3333/api/chat/history?chatMode=ai_friend"
```

### AI Psychologist Mode History
```bash
curl -X GET "http://localhost:3333/api/chat/history?chatMode=ai_psychologist"
```

### Expected Response
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hey! I just got promoted!",
      "timestamp": "2025-12-29T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "Omg that's AMAZING!! 🎉...",
      "timestamp": "2025-12-29T10:00:01Z"
    }
  ]
}
```

**✅ Each mode has SEPARATE history - they don't mix!**

---

## 5. Image Generation

### Test Request
```bash
curl -X POST http://localhost:3333/api/media/generate-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset over mountains with vibrant colors",
    "aspectRatio": "16:9"
  }'
```

### Expected Response
```json
{
  "success": true,
  "image": {
    "url": "data:image/png;base64,iVBORw0KG...",
    "prompt": "A beautiful sunset over mountains with vibrant colors",
    "width": 1920,
    "height": 1080,
    "aspectRatio": "16:9"
  }
}
```

### Aspect Ratios Supported
- `1:1` - Square (1024x1024)
- `16:9` - Landscape (1920x1080)
- `9:16` - Portrait (1080x1920)
- `4:3` - Standard (1024x768)
- `3:4` - Vertical (768x1024)

---

## 6. Video Generation

### Test Request
```bash
curl -X POST http://localhost:3333/api/media/generate-video \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene mountain landscape with clouds moving slowly across the sky",
    "duration": 5,
    "aspectRatio": "16:9"
  }'
```

### Expected Response
```json
{
  "success": true,
  "video": {
    "url": "https://storage.googleapis.com/...",
    "prompt": "A serene mountain landscape...",
    "duration": 5,
    "width": 1280,
    "height": 720,
    "aspectRatio": "16:9"
  }
}
```

### Video Options
- Duration: 2-10 seconds
- Aspect Ratios: `16:9`, `9:16`, `1:1`

---

## 7. Normal Chat with Image Generation

### Test Request
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Show me a beautiful beach at sunset",
    "chatMode": "normal",
    "model": "gemini-lite"
  }'
```

### Expected Response
```json
{
  "message": "Here's information about beach sunsets.\n\nKey features:\n• Golden hour lighting\n• Reflection on water\n• Warm color palette",
  "model": "gemini-lite",
  "images": [
    {
      "url": "data:image/png;base64,...",
      "prompt": "beautiful beach at sunset",
      "width": 1024,
      "height": 1024
    }
  ],
  "sources": []
}
```

**✅ Automatically generates image when keywords detected: "show me", "generate", "create", "visualize", etc.**

---

## 8. Clear Chat History for Specific Mode

### Test Request
```bash
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Start fresh conversation",
    "chatMode": "ai_friend",
    "newConversation": true,
    "model": "gemini-lite"
  }'
```

**✅ This clears ONLY ai_friend mode history. Other modes stay intact.**

---

## Testing Checklist

### Chat Modes
- [ ] Normal mode uses bullet points (•)
- [ ] Normal mode has structured format
- [ ] AI Friend mode is casual and natural (no bullets)
- [ ] AI Friend uses emojis and friendly tone
- [ ] AI Psychologist is professional and empathetic
- [ ] AI Psychologist speaks naturally (no bullets unless steps)
- [ ] All responses say "SyntraIQ" not "Perle"

### History
- [ ] Normal mode history separate from others
- [ ] AI Friend mode history separate from others
- [ ] AI Psychologist mode history separate from others
- [ ] newConversation clears only that mode's history

### Media Generation
- [ ] Image generation works with Gemini API
- [ ] Different aspect ratios work
- [ ] Video generation works with Gemini Veo
- [ ] Videos up to 10 seconds generate successfully
- [ ] Auto image generation in normal chat works

---

## Quick Test Script

Save this as `test-all.sh`:

```bash
#!/bin/bash

echo "Testing Normal Chat Mode..."
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What are 3 benefits of exercise?","chatMode":"normal","model":"gemini-lite"}'

echo -e "\n\n---\nTesting AI Friend Mode..."
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hey! How are you doing today?","chatMode":"ai_friend","model":"gemini-lite"}'

echo -e "\n\n---\nTesting AI Psychologist Mode..."
curl -X POST http://localhost:3333/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"I have been feeling stressed lately","chatMode":"ai_psychologist","model":"gemini-lite"}'

echo -e "\n\n---\nTesting Image Generation..."
curl -X POST http://localhost:3333/api/media/generate-image \
  -H "Content-Type: application/json" \
  -d '{"prompt":"A cute cat sitting on a windowsill","aspectRatio":"1:1"}'

echo -e "\n\nAll tests complete!"
```

Run with:
```bash
chmod +x test-all.sh
./test-all.sh
```

---

## Expected Behavior Summary

| Mode | Format | Tone | Bullet Points | History |
|------|--------|------|---------------|---------|
| Normal | Structured | Professional | YES (always) | Separate |
| AI Friend | Natural | Casual/Warm | NO (never) | Separate |
| AI Psychologist | Natural | Professional/Empathetic | NO (unless steps) | Separate |

---

**All endpoints ready for testing!** 🚀


