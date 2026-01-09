# AI Friend Image Understanding Feature

## Overview
AI friends can now understand and analyze images sent in chat messages, both in individual and group chats.

## Features

### 1. Image Attachment Support
- **File Types**: Supports all standard image formats (PNG, JPG, GIF, WebP, etc.)
- **Size Limit**: Maximum 10MB per image
- **UI**: Clean attachment indicator with file name and remove button

### 2. Image Understanding
- **Vision Models**: Automatically uses vision-capable models (Gemini Flash, GPT-4o, etc.)
- **Context Aware**: AI friends can describe, analyze, and answer questions about images
- **Example Queries**:
  - "What's in this image?"
  - "Describe what you see"
  - "What color is the shirt?"
  - "Read the text in this image"

### 3. @Mention Support with Images
- **Individual Chat**: AI friend responds to both text and image
- **Group Chat**: 
  - Mention specific friends with `@username` to have them analyze the image
  - If no mentions, all friends respond to the image
  - Each friend sees the same image and can provide unique insights

### 4. Chat History Persistence
- **Individual Chats**: Each AI friend maintains separate conversation history
- **Group Chats**: Shared history visible to all friends
- **Image Context**: Images are not stored in history (only text descriptions)

## Usage

### Individual Chat
1. Click the attach button (📎)
2. Select an image file
3. Type your message (optional)
4. Click send
5. AI friend will analyze the image and respond

### Group Chat with @Mentions
1. Enable "Group Chat" mode
2. Attach an image
3. Type `@username what do you see?`
4. Only the mentioned friend will analyze the image
5. Or send without mentions for all friends to respond

## Technical Implementation

### Frontend (`AIFriendPage.tsx`)
- `attachedFile` state stores the File object
- FormData is used to send multipart/form-data when an image is attached
- Image preview is shown in the message bubble

### Backend (`chat.ts`)
- Multer middleware handles image uploads
- Images are converted to base64 data URLs
- Passed to vision-capable AI models

### AI Providers (`aiProviders.ts`)
- **Gemini**: Uses `inlineData` format with base64 and mimeType
- **OpenAI**: Uses content array with `image_url` type
- **Claude & Grok**: Signature updated (implementation pending)

## Limitations
- Maximum 1 image per message
- Images are processed in real-time (not stored permanently)
- Free users limited to Gemini Lite (has vision capabilities)
- Premium users can use GPT-4o, Gemini 2.0, etc.

## IST Timezone Support
All timestamps in AI friend chats (and across the app) now display in **Indian Standard Time (IST)**.

### Format
- **Time Only**: `02:30 PM`
- **Full DateTime**: `Jan 7, 2025, 02:30 PM`

### Implementation
Utility functions in `utils/helpers.ts`:
```typescript
formatTimestampIST(date: Date): string
formatDateTimeIST(date: Date): string
```

## Future Enhancements
- [ ] Support multiple images per message
- [ ] Image gallery in chat history
- [ ] Image editing tools (crop, resize, filters)
- [ ] Voice description of images for accessibility
- [ ] Save analyzed images to user's gallery


