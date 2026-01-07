# AI Friend Username Feature

## Overview
Each AI Friend now has a **unique username** that is automatically generated when creating or editing a friend. This makes @mentions in group chat much cleaner and avoids issues with spaces or special characters in names.

## Database Changes

### Migration File
`server/database/add_username_to_ai_friends.sql`

Run this SQL to add the username field:
```sql
-- Adds username column to ai_friends table
-- Creates unique index for username
-- Generates usernames for existing friends
-- Adds validation constraints (3-20 chars, alphanumeric + underscore)
```

**To apply:**
```bash
psql -U your_user -d your_database -f server/database/add_username_to_ai_friends.sql
```

## Username Generation Logic

### Format Rules
- **Lowercase only**: All usernames are lowercase
- **Alphanumeric + underscore**: Only `a-z`, `0-9`, and `_` allowed
- **Length**: 3-20 characters
- **Unique per user**: Each user's friends must have unique usernames

### Auto-Generation Process
When creating or updating a friend:
1. Take the friend's name
2. Convert to lowercase
3. Remove all non-alphanumeric characters
4. Check if username exists for this user
5. If taken, append a number (e.g., `johnsmith2`, `johnsmith3`)
6. Ensure final username is 3-20 characters

### Examples
| Friend Name | Generated Username |
|-------------|-------------------|
| John Smith | `johnsmith` |
| Sarah-Lee | `sarahlee` |
| AI Assistant 2024 | `aiassistant2024` |
| Bob | `bobai` (padded if < 3 chars) |
| Dr. Michael O'Connor | `drmichaeloconnor` |

If `johnsmith` is already taken:
- Second friend → `johnsmith2`
- Third friend → `johnsmith3`

## How @Mentions Work

### In Group Chat
1. Type `@` to trigger autocomplete
2. See list of friends with their **@usernames** prominently displayed
3. Select a friend (Enter, click, or Tab)
4. `@username` is inserted into your message
5. Message is sent to only the mentioned friend(s)

### Mention Parsing
```typescript
// Example message: "Hey @john and @sarah, what do you think?"
// Parsed IDs: [john's ID, sarah's ID]
// Only John and Sarah will respond
```

### No Mentions = Everyone Responds
If you don't use any @mentions in group chat, **all friends** respond.

## UI Updates

### Friends List
Shows usernames next to names:
```
John Smith @johnsmith
Sarah Lee @sarahlee
```

### Autocomplete Dropdown
Primary display: **@username** (bold, accent color)
Secondary: Friend's full name (smaller, dimmed)

### Insertion
When you select a friend, `@username` is inserted (not `@Full Name`).

## Backend Changes

### API Endpoints
- `POST /api/ai-friends`: Auto-generates username
- `PUT /api/ai-friends/:id`: Regenerates username if name changes
- `GET /api/ai-friends`: Returns username in response

### New Function
```typescript
async function generateUsername(
  name: string, 
  userId: string, 
  excludeId?: string
): Promise<string>
```

## Testing

### Create a New Friend
1. Go to AI Friend page
2. Click "Create New Friend"
3. Enter name: "John Smith"
4. Save
5. Check sidebar → should show `@johnsmith`

### Test @Mentions
1. Toggle "Group Chat" mode
2. Type `@` → autocomplete appears
3. Select a friend → `@username` inserted
4. Send message → only that friend responds

### Test Duplicate Names
1. Create "John Smith" → username: `johnsmith`
2. Create another "John Smith" → username: `johnsmith2`
3. Both work independently in @mentions

## Benefits

✅ **Clean mentions**: No spaces (was: `@John Smith`, now: `@johnsmith`)  
✅ **No ambiguity**: Unique usernames prevent confusion  
✅ **Easy to type**: Simple, lowercase identifiers  
✅ **Auto-generated**: Users don't have to think about it  
✅ **Works with special chars**: Names like "Dr. O'Connor" → `droconnor`  

## Future Enhancements
- Allow users to customize usernames (optional)
- Show suggested usernames during friend creation
- Username availability checker in real-time


