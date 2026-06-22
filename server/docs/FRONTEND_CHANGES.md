# SyntraIQ Frontend — What to Update

Everything the backend now supports that the frontend needs to wire up.

---

## 1. New Model IDs — Add to Your Model Selector

Copy this complete list into your frontend `LLMModel` type and model-picker UI.

### OpenAI
| UI ID | What it is |
|-------|-----------|
| `gpt-5.5-pro` | GPT-5.5 Pro — highest OpenAI tier (premium only) |
| `gpt-5.5` | GPT-5.5 |
| `gpt-5.4` | GPT-5.4 |
| `gpt-4.1` | GPT-4.1 |
| `gpt-4.1-mini` | GPT-4.1 Mini |
| `gpt-4.1-nano` | GPT-4.1 Nano |
| `o3` | OpenAI o3 reasoning (premium only) |
| `o4-mini` | OpenAI o4-mini reasoning |

### Google Gemini
| UI ID | What it is |
|-------|-----------|
| `gemini-3.5-flash` | Gemini 3.5 Flash |
| `gemini-3.1-flash-lite` | Gemini 3.1 Flash Lite |
| `gemini-lite` | *(existing)* — maps to Gemini 2.5 Flash Lite |

### Anthropic Claude
| UI ID | What it is |
|-------|-----------|
| `claude-4.8-opus` | Claude 4.8 Opus — top tier |
| `claude-4.7-opus` | Claude 4.7 Opus |

### xAI Grok
| UI ID | What it is |
|-------|-----------|
| `grok-4.20` | Grok 4.20 (premium only) |
| `grok-4.3` | Grok 4.3 |

### Suggested categorisation in the model picker

```
Normal / Chat:
  gemini-lite, gpt-4.1-nano, gpt-4.1-mini, claude-4.5-haiku,
  grok-4.3, gemini-3.1-flash-lite

Web Search:
  gpt-4o, gpt-4.1, gpt-5.4, gpt-5.5, gemini-3.5-flash,
  claude-4.6-sonnet, claude-4.7-opus, grok-4.3, grok-4.20, auto

Deep Research / Reasoning:
  o3, o4-mini, gpt-5.5-pro, claude-4.8-opus, gpt-5.5,
  gemini-pro, grok-4-heavy
```

---

## 2. TypeScript Types to Sync

Copy this into your frontend `types.ts`:

```typescript
export type LLMModel =
  | 'auto'
  // OpenAI
  | 'gpt-5' | 'gpt-5.1' | 'gpt-5.2' | 'gpt-5.3' | 'gpt-5.4' | 'gpt-5.5' | 'gpt-5.5-pro'
  | 'gpt-4.1' | 'gpt-4.1-mini' | 'gpt-4.1-nano'
  | 'o3' | 'o4-mini'
  | 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-4' | 'gpt-3.5-turbo'
  // Gemini
  | 'gemini-2.0-latest' | 'gemini-3.0' | 'gemini-3.1' | 'gemini-3.1-flash'
  | 'gemini-3.5-flash' | 'gemini-3.1-flash-lite' | 'gemini-lite'
  | 'gemini-pro' | 'gemini-pro-vision'
  // Claude
  | 'claude-4.8-opus' | 'claude-4.7-opus'
  | 'claude-4.5-sonnet' | 'claude-4.5-opus' | 'claude-4.6-sonnet' | 'claude-4.6-opus'
  | 'claude-4.5-haiku' | 'claude-4-sonnet' | 'claude-4-opus' | 'claude-4.1-opus' | 'claude-3-haiku'
  // Grok
  | 'grok-4.3' | 'grok-4.20' | 'grok-3' | 'grok-3-mini'
  | 'grok-4-heavy' | 'grok-4-fast' | 'grok-code-fast-1' | 'grok-beta'
  // Others
  | 'llama-2' | 'mistral-7b';

export interface FileAttachment {
  dataUrl: string;
  mimeType: string;
  filename?: string;
}
```

---

## 3. Multi-File Upload — Search & Chat

The backend now accepts **multiple files** (images + documents) in a single request.

### How to send files

Use `multipart/form-data`. Send each file under the field name **`files`**. The old single-image field (`image`) is still accepted for backwards compat.

```typescript
const fd = new FormData();
fd.append('query', 'Describe all attached files');
fd.append('mode', 'Ask');
fd.append('model', 'claude-4.6-sonnet');

// Attach multiple files — all under the same field name "files"
fd.append('files', pdfBlob,   'report.pdf');
fd.append('files', imageBlob, 'chart.png');
fd.append('files', txtBlob,   'notes.txt');
fd.append('files', docxBlob,  'contract.docx');

const res = await fetch('/api/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: fd,
});
```

### Accepted file types

| Type | MIME |
|------|------|
| Images | `image/jpeg`, `image/png`, `image/gif`, `image/webp` |
| PDF | `application/pdf` |
| Word | `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Plain text | `text/plain` |
| CSV | `text/csv` |
| Excel | `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

Max size per file: **10 MB**

### Per-model file limits (backend enforces — excess silently trimmed)

| Tier | Any model |
|------|-----------|
| Free | **2 files** max |

| Tier | Model family | Limit |
|------|-------------|-------|
| Premium | Claude | 20 files |
| Premium | Gemini | 10 files |
| Premium | OpenAI | 10 files |
| Premium | Grok | 5 files |

> The backend trims silently — no error. Show the user the per-model limit in the UI so they know before uploading.

---

## 4. Image → Video Generation

### Route A — `POST /api/media/generate-video`
Generates a video. If you provide a reference image it generates **from that image** (not random).

**Requires authentication (pro or max tier).**

**Option 1: multipart with image file**
```typescript
const fd = new FormData();
fd.append('prompt', 'Slow pan across the scene');
fd.append('duration', '5');          // 2–10 seconds
fd.append('aspectRatio', '16:9');    // '16:9' | '9:16' | '1:1'
fd.append('referenceImage', imageBlob, 'frame.jpg');  // ← exactly 1 image

fetch('/api/media/generate-video', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: fd,
});
```

**Option 2: JSON body with base64 image**
```typescript
fetch('/api/media/generate-video', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'Bring this image to life',
    duration: 5,
    aspectRatio: '16:9',
    imageDataUrl: `data:image/jpeg;base64,${base64String}`, // ← 1 image
  }),
});
```

### Route B — `POST /api/media/generate-video-from-image`
Dedicated image-to-video route.

**Requires authentication (pro or max tier).**

```typescript
const fd = new FormData();
fd.append('prompt', 'Animate with gentle motion');
fd.append('duration', '5');
fd.append('aspectRatio', '16:9');
fd.append('image', imageBlob, 'input.jpg');  // ← field name is "image", exactly 1

fetch('/api/media/generate-video-from-image', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: fd,
});
```

### Image limit for video — always 1

Veo 3.0, Veo 3.1, and Sora all accept **exactly 1 image** as the starting frame. The backend enforces this via `upload.single()` — only show 1 image picker for video generation, not a multi-file input.

### Response shape
```typescript
{
  url: string;          // proxy URL — use this to play the video
  prompt: string;
  duration: number;
  width: number;
  height: number;
}
```

### Daily limit error (429)

Both video routes enforce daily limits. Show this in the UI when the user hits the cap:

| Tier | Daily limit |
|------|-------------|
| Pro | 6 videos/day |
| Max | 12 videos/day |

```typescript
// HTTP 429 response body:
{
  error: "Daily video generation limit reached. Upgrade to Max for 12 videos per day.",
  limit: 6,      // or 12 for max tier
  used: 6,
  tier: "pro"    // or "max"
}
```

**Frontend:** catch `429`, show the `error` message, and optionally display `used / limit`. For pro users, suggest upgrading to Max.

**Tip:** call `GET /api/media/quota` (authenticated) to show remaining videos before the user tries to generate.

---

## 5. Premium vs Free — What Changes for the User

| Feature | Free | Premium (pro/max) |
|---------|------|--------------------|
| File uploads per request | 2 | 5–20 (per model) |
| Answer depth/length | Standard | 2–3× longer, more detailed, richer formatting |
| Model access | `gemini-lite` only (forced) | All models |
| Video generation | ❌ | ✅ (pro=6/day, max=12/day) |
| Context history | 10 messages | 20 messages |

The backend reads the JWT from `Authorization: Bearer <token>` on every request. No extra field needed — just send the token and the backend figures out the tier automatically.

### Free users — model is forced on backend

Even if the frontend sends `gpt-4o` or `claude-4.6-sonnet`, the backend **overrides free users to `gemini-lite`**. Premium users get the model they selected (`auto` also maps to `gemini-lite`).

**Frontend should:**
- Hide or disable all models except `gemini-lite` (and optionally `auto`) for free users
- Show an upgrade prompt when a free user taps a premium model
- Do **not** rely on the frontend alone — backend always enforces this

---

## 6. Sources — No Cap

Web search sources are now **uncapped**. The backend returns however many the search APIs find (typically 5–25 depending on the query). Don't hardcode a limit of 15 anywhere in the frontend rendering — render all sources returned in the `sources` array.

### Search order (backend)

The backend now uses **provider-native search first**, Exa only as fallback:

```
1. Active model's own search (Gemini grounding / OpenAI web / Grok web)
2. Alternate LLM search if step 1 returns nothing
3. Exa (auto / instant / deep) only if all providers return 0 results
```

This is faster because most queries no longer wait for an extra Exa API call.

---

## 7. Silent Model Failover — Nothing to Do

The backend silently falls back to a working model if the requested one errors. The response always comes back from `sources[]` + `chunks[]` — same shape regardless of which model actually answered. The frontend doesn't need to do anything for this.

---

## 8. Request/Response Reference

### `POST /api/search`
```
Content-Type: multipart/form-data   (always, even without files)
Authorization: Bearer <token>       (optional — omit for free/anonymous)
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `query` | string | ✅ | max 500 chars |
| `mode` | `'Ask' \| 'Research' \| 'Summarize' \| 'Compare'` | — | default `Ask` |
| `model` | LLMModel | — | default `gemini-lite` |
| `conversationId` | UUID string | — | omit on first message |
| `newConversation` | boolean | — | `true` to reset context |
| `conversationHistory` | `{role,content}[]` | — | last N messages |
| `searchType` | `'auto' \| 'instant' \| 'deep'` | — | Exa search type |
| `userContext` | JSON string | — | locale, timezone, etc. |
| `files` | File[] | — | multi-file field |
| `image` | File | — | legacy single-image field |

### `POST /api/chat`
Same **request** fields as `/api/search` (including multi-file `files` upload), but use `message` instead of `query`:

| Field | Type | Notes |
|-------|------|-------|
| `message` | string | the user message (required) |
| `chatMode` | `'normal' \| 'ai_friend' \| 'ai_psychologist' \| 'space'` | default `normal` |
| `aiFriendId` | string | required when chatMode=`ai_friend` |
| `spaceId` | string | optional, for space mode |
| `mentionedFriendIds` | string[] | optional, for space mode |

**Chat response is different from search** — do not parse it the same way:

```typescript
// POST /api/chat → response
{
  message: string;              // full answer text (not chunks[])
  model: string;                // actual model used
  images?: GeneratedImage[];    // optional generated images
  sources: Source[];            // empty in ai_psychologist mode
  suggestedQuestions: string[]; // empty in ai_friend mode
}

// POST /api/search → response (AnswerResult)
{
  sources: Source[];
  chunks: Array<{ text: string; citationIds: string[] }>;
  query: string;
  mode: Mode;
  timestamp: number;
  suggestedQuestions?: string[];
  conversationId?: string;      // ← only search returns this
  images?: GeneratedImage[];
}
```

Use `chunks.map(c => c.text).join('\n\n')` for search answers, or `message` directly for chat.

### Response shape (`AnswerResult` — search only)
```typescript
{
  sources: Array<{
    id: string;
    title: string;
    url: string;
    domain?: string;
    snippet?: string;
    year?: number;
  }>;
  chunks: Array<{
    text: string;
    citationIds: string[];  // reference source IDs
    confidence?: number;
  }>;
  query: string;
  mode: Mode;
  timestamp: number;
  suggestedQuestions?: string[];
  conversationId?: string;  // save this and send it back on the next message
  images?: Array<{ url: string; prompt: string; width: number; height: number }>;
}
```

---

## 9. Auth — Never Log Out (Refresh Token Flow)

The backend now supports persistent sessions. Users will **never be logged out** as long as they use the app at least once every 7 days (Supabase refresh token rolling window).

### What login now returns

```typescript
// POST /api/auth/login  →  response body
{
  token: string;         // access token — valid for 1 hour
  refreshToken: string;  // NEW — long-lived, rotates on each use
  expiresAt: number;     // NEW — Unix timestamp (seconds) when access token expires
  expiresIn: number;     // NEW — always 3600 (1 hour)
  user: {
    id: string;
    name: string;
    email: string;
    isPremium: boolean;
    premiumTier: 'free' | 'pro' | 'max';
    subscription: {
      status: string;
      tier: string;
      endDate: string | null;
      autoRenew: boolean;
    };
    notifications: boolean;
    darkMode: boolean;
    searchHistory: boolean;
    voiceSearch: boolean;
  }
}
```

### Signup / OTP verify — important

`POST /api/auth/verify-otp` currently returns only `token` + `user` (no `refreshToken` yet).

**Frontend options:**
1. **Recommended:** after OTP verify succeeds, immediately call `POST /api/auth/login` with email + password to get full session (`refreshToken`, `expiresAt`)
2. **Or:** treat OTP `token` as short-lived and redirect to login if it expires

If you use signup OTP as the primary login path, wire the same `getValidToken()` flow but only after obtaining `refreshToken` from login.

### New endpoint: `POST /api/auth/refresh`

No Authorization header needed — the refresh token IS the credential.

```typescript
// Request body:
{ "refreshToken": "lmzl6s3h7ubl..." }

// Response (200 OK):
{
  "token": "eyJ...",           // new access token
  "refreshToken": "w7pizn...", // new refresh token (old one is now invalid)
  "expiresAt": 1781699097,
  "expiresIn": 3600
}

// Response (401) if refresh token is invalid/expired:
{ "error": "Refresh token invalid or expired. Please log in again." }
```

### Silent middleware refresh

If the frontend sends an expired access token but includes `X-Refresh-Token` header, the backend silently refreshes mid-request — the API call still succeeds. The new tokens come back in response headers:

| Response header | Value |
|-----------------|-------|
| `X-New-Access-Token` | new JWT |
| `X-New-Refresh-Token` | new refresh token |
| `X-New-Expires-At` | Unix timestamp |

### Frontend implementation

**Step 1 — Store both tokens on login**
```typescript
const { token, refreshToken, expiresAt } = await loginResponse.json();
localStorage.setItem('accessToken',    token);
localStorage.setItem('refreshToken',   refreshToken);
localStorage.setItem('tokenExpiresAt', String(expiresAt));
```

**Step 2 — Helper: always get a valid token before any request**
```typescript
async function getValidToken(): Promise<string | null> {
  const expiresAt   = Number(localStorage.getItem('tokenExpiresAt') || 0);
  const nowSeconds  = Math.floor(Date.now() / 1000);

  // Refresh 5 minutes before expiry (300 seconds buffer)
  if (expiresAt - nowSeconds < 300) {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) {
      redirectToLogin();
      return null;
    }

    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });

    if (!res.ok) {
      // Refresh token itself expired (> 7 days of inactivity) → re-login
      localStorage.clear();
      redirectToLogin();
      return null;
    }

    const { token, refreshToken, expiresAt: newExpiry } = await res.json();
    localStorage.setItem('accessToken',    token);
    localStorage.setItem('refreshToken',   refreshToken);
    localStorage.setItem('tokenExpiresAt', String(newExpiry));
    return token;
  }

  return localStorage.getItem('accessToken');
}
```

**Step 3 — Use on every API call**

Send **both** headers so the backend can silently refresh if the access token expired mid-session:

```typescript
const token = await getValidToken();
const refreshToken = localStorage.getItem('refreshToken');
if (!token) return; // user was redirected to login

const res = await fetch('/api/search', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    ...(refreshToken ? { 'X-Refresh-Token': refreshToken } : {}),
  },
  body: fd,
});

// If backend silently refreshed, save the new tokens from response headers
const newAT = res.headers.get('X-New-Access-Token');
if (newAT) {
  localStorage.setItem('accessToken',    newAT);
  localStorage.setItem('refreshToken',   res.headers.get('X-New-Refresh-Token') || '');
  localStorage.setItem('tokenExpiresAt', res.headers.get('X-New-Expires-At') || '');
}
```

**Step 4 — On app startup, check token validity**
```typescript
// In your app's main entry point / useEffect on mount:
async function initSession() {
  const token = await getValidToken();
  if (!token) {
    showLoginScreen();
  } else {
    // Token valid (or silently refreshed) — user stays logged in
    loadApp();
  }
}
```

### How long do sessions last?

| Token type | Lifespan | Notes |
|------------|----------|-------|
| Access token | 1 hour | Refreshed automatically |
| Refresh token | Rolling 7 days | As long as user opens the app within 7 days, it never expires |

A user who uses the app every day will **never** be asked to log in again.

---

## 10. Backend-Only Changes (No Frontend Work)

These were fixed on the backend — frontend does **not** need to change anything:

| Change | Why no frontend work |
|--------|----------------------|
| Silent model failover | Same response shape always; user never sees which model answered |
| Premium longer/detailed answers | Backend prompt + token limits; just send auth token |
| Compare mode table formatting | Backend formats markdown tables in the answer text |
| Web search source count logic | Backend returns all sources; frontend just renders `sources[]` |
| Grok/Claude/Gemini API fixes | Backend model routing only |

---

## 11. Quick Checklist

- [ ] Update `LLMModel` type with all new IDs (see Section 2)
- [ ] Add new models to the model selector UI with correct categories (see Section 1)
- [ ] **Free users: hide/disable premium models** — backend forces `gemini-lite` anyway (see Section 5)
- [ ] Change file upload input to accept multiple files (`multiple` attribute), field name `files`
- [ ] Apply multi-file upload to **both** `/api/search` and `/api/chat`
- [ ] Show per-model file limit in the UI (free=2, premium Gemini=10, Claude=20, OpenAI=10, Grok=5)
- [ ] Show accepted MIME types in file picker (PDF, DOCX, TXT, CSV, PNG, JPG, GIF, WEBP)
- [ ] Image-to-video: show only 1 image picker (not multi)
- [ ] Handle video **429 daily limit** — show `error`, `used/limit`, upgrade CTA (see Section 4)
- [ ] Remove any hardcoded 15-source limit in source rendering
- [ ] Parse **search** (`chunks[]`) vs **chat** (`message`) responses differently (see Section 8)
- [ ] Send `Authorization: Bearer <token>` on all requests when user is logged in
- [ ] Send `X-Refresh-Token` header on authenticated requests (see Section 9)
- [ ] Save `conversationId` from **search** response and send it back on follow-up messages
- [ ] Gate video generation UI behind pro/max tier check
- [ ] **Store `refreshToken` + `expiresAt` from login response** (see Section 9)
- [ ] **After OTP signup verify, call login** to get `refreshToken` (see Section 9)
- [ ] **Implement `getValidToken()` helper** that auto-refreshes before expiry (see Section 9)
- [ ] **On every API response**, check for `X-New-Access-Token` header and save new tokens
- [ ] **On app startup**, call `getValidToken()` — if null, show login; otherwise stay logged in
