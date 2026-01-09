# Chat History Architecture

## Overview
Chat history is **fully isolated** per user, per chat mode, and per context (friend/space). This ensures conversations never mix and persist correctly.

## Database Schema

### Table: `conversation_history`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `user_id` | UUID | **ISOLATION**: Separates users |
| `chat_mode` | TEXT | **ISOLATION**: Separates chat types (ai_friend, ai_psychologist, space, normal) |
| `ai_friend_id` | UUID | **ISOLATION**: Separates individual friend chats (NULL = group chat) |
| `space_id` | UUID | **ISOLATION**: Separates space chats (NULL = non-space) |
| `query` | TEXT | User's message |
| `answer` | TEXT | AI's response |
| `model` | TEXT | Which model was used |
| `mode` | TEXT | Search mode (Ask, Create, Research, etc.) |
| `created_at` | TIMESTAMP | When saved |

## Isolation Logic

### 1. Individual AI Friend Chat
**Example**: Chatting with friend "Alex"
```
user_id = "user123"
chat_mode = "ai_friend"
ai_friend_id = "alex-uuid"
space_id = NULL
```
✅ **Result**: Only shows history with Alex, separate from all other friends

### 2. Group AI Friend Chat
**Example**: Group chat with all friends
```
user_id = "user123"
chat_mode = "ai_friend"
ai_friend_id = NULL
space_id = NULL
```
✅ **Result**: Shared history visible to all friends in group chat mode

### 3. AI Psychologist Chat
**Example**: Therapy session with Dr. Maya
```
user_id = "user123"
chat_mode = "ai_psychologist"
ai_friend_id = NULL
space_id = NULL
```
✅ **Result**: Completely separate from AI friends, maintains therapy context

### 4. Space Chat
**Example**: Chatting in "Work Projects" space
```
user_id = "user123"
chat_mode = "space"
space_id = "work-projects-uuid"
ai_friend_id = NULL
```
✅ **Result**: Only shows history for this specific space

### 5. Normal Chat
**Example**: Regular search/answer mode
```
user_id = "user123"
chat_mode = "normal"
ai_friend_id = NULL
space_id = NULL
```
✅ **Result**: Main search history, separate from all friends/spaces

## Backend Logic

### Saving History (`POST /api/chat`)

```typescript
// Backend automatically saves with correct isolation:
await supabase
  .from('conversation_history')
  .insert({
    user_id: req.userId,
    query: userMessage,
    answer: aiResponse,
    chat_mode: chatMode,              // 'ai_friend', 'ai_psychologist', etc.
    ai_friend_id: aiFriendId || null, // Friend ID or NULL for group
    space_id: spaceId || null,        // Space ID or NULL
    model: actualModel,
    mode: 'Ask'
  });
```

### Loading History (`GET /api/chat/history`)

```typescript
// Backend filters by ALL isolation fields:
let query = supabase
  .from('conversation_history')
  .select('*')
  .eq('user_id', userId)           // ✅ User isolation
  .eq('chat_mode', chatMode);      // ✅ Mode isolation

// Add friend isolation if needed
if (chatMode === 'ai_friend' && aiFriendId) {
  query = query.eq('ai_friend_id', aiFriendId); // ✅ Individual friend
} else if (chatMode === 'ai_friend') {
  query = query.is('ai_friend_id', null);        // ✅ Group chat
}

// Add space isolation if needed
if (spaceId) {
  query = query.eq('space_id', spaceId);         // ✅ Space-specific
} else {
  query = query.is('space_id', null);            // ✅ Non-space
}
```

## Storage Limits

| User Type | History Limit | Cleanup |
|-----------|---------------|---------|
| Free | 5 messages (10 exchanges) | Auto-delete oldest |
| Premium (Pro/Max) | 20 messages (40 exchanges) | Auto-delete oldest |

History is automatically cleaned up per isolation context (keeps last N per friend/space/mode).

## Frontend Implementation

### Individual Friend Chat
```typescript
// Loads history for specific friend
useEffect(() => {
  loadHistory(selectedFriendId);
}, [selectedFriendId]);

// API call: /api/chat/history?chatMode=ai_friend&aiFriendId=abc123
```

### Group Friend Chat
```typescript
// Loads shared group history
useEffect(() => {
  loadHistory(null); // No friend ID = group chat
}, [isGroupChat]);

// API call: /api/chat/history?chatMode=ai_friend
```

### AI Psychology Chat
```typescript
// Loads psychology history
useEffect(() => {
  loadHistory();
}, []);

// API call: /api/chat/history?chatMode=ai_psychologist
```

## Migration Required

To enable this architecture, run the SQL migration:

```bash
server/database/add_space_and_friend_columns.sql
```

This adds:
- `space_id` column
- `ai_friend_id` column
- Performance indexes
- Proper constraints

## Testing Isolation

### Test 1: Individual Friend Isolation
1. Chat with Friend A: "Hello A"
2. Chat with Friend B: "Hello B"
3. Switch back to Friend A
4. ✅ Should only see "Hello A", not "Hello B"

### Test 2: Group vs Individual
1. Chat with Friend A individually: "Private message"
2. Switch to Group Chat: "Group message"
3. Switch back to Individual Friend A
4. ✅ Should see "Private message", not "Group message"

### Test 3: Psychology Isolation
1. Chat with AI Friend: "Tell me a joke"
2. Switch to AI Psychologist: "I feel anxious"
3. Switch back to AI Friend
4. ✅ Should see "Tell me a joke", not therapy content

### Test 4: Persistence After Reload
1. Chat with any context
2. Refresh browser (Cmd+R / F5)
3. ✅ All messages should reload in correct context

## Troubleshooting

### Problem: History not loading
**Check**: Database has `space_id` and `ai_friend_id` columns
**Solution**: Run migration SQL

### Problem: Histories mixing between friends
**Check**: Backend logs show correct `aiFriendId`
**Solution**: Verify frontend passes correct `aiFriendId` in API calls

### Problem: History disappears after reload
**Check**: Backend logs show `✅ History saved successfully`
**Solution**: Check Supabase permissions and column constraints

## Performance Considerations

- ✅ All queries use composite indexes
- ✅ Automatic cleanup prevents table bloat
- ✅ Lazy loading (history loads after greeting)
- ✅ Frontend caching (no re-fetch on every render)

## Security

- ✅ All queries filtered by `user_id` (RLS enabled)
- ✅ Users can only access their own history
- ✅ Friend/space IDs validated against ownership
- ✅ No cross-user data leakage possible


