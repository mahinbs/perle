# SyntraIQ Backend — Frontend Integration Guide (June 2026)

This document covers **backend changes** the frontend team should wire up.

---

## 1. New AI models (add to model picker)

Add these `LLMModel` IDs to `src/types/index.ts` and `LLMModelSelector.tsx`:

### OpenAI
| UI ID | Label suggestion | API mapping |
|-------|------------------|-------------|
| `gpt-5.4` | GPT-5.4 | `gpt-5.4` |
| `gpt-5.5` | GPT-5.5 | `gpt-5.5` |
| `gpt-5.5-pro` | GPT-5.5 Pro | `gpt-5.5-pro` |
| `gpt-4.1` | GPT-4.1 | `gpt-4.1` |
| `gpt-4.1-mini` | GPT-4.1 Mini | `gpt-4.1-mini` |
| `gpt-4.1-nano` | GPT-4.1 Nano | `gpt-4.1-nano` |
| `o3` | o3 (reasoning) | `o3` |
| `o4-mini` | o4-mini (reasoning) | `o4-mini` |

### Google Gemini
| UI ID | Label suggestion |
|-------|------------------|
| `gemini-3.5-flash` | Gemini 3.5 Flash |
| `gemini-3.1-flash-lite` | Gemini 3.1 Flash Lite |

### Anthropic Claude
| UI ID | Label suggestion |
|-------|------------------|
| `claude-4.8-opus` | Claude Opus 4.8 |
| `claude-4.7-opus` | Claude Opus 4.7 |

### xAI Grok
| UI ID | Label suggestion |
|-------|------------------|
| `grok-4.3` | Grok 4.3 |
| `grok-4.20` | Grok 4.20 Multi-Agent |

**Note:** Legacy IDs (`grok-3`, `grok-4-heavy`, etc.) still work — backend maps them to current API models.

**Source of truth:** `server/src/utils/modelRegistry.ts` → `LLM_MODEL_ENUM`

---

## 2. Multi-file upload (images + documents)

### API change

| Before | After |
|--------|-------|
| Single field `image` | **`files`** array (preferred) + legacy `image` still supported |
| 1 file max on server | Up to **20** uploaded; trimmed per model/tier |

### Endpoints
- `POST /api/search`
- `POST /api/chat`

### FormData example

```typescript
const formData = new FormData();
formData.append('query', 'Describe these documents');
formData.append('mode', 'Ask');
formData.append('model', 'claude-4.6-sonnet');

// NEW: append multiple files
for (const file of selectedFiles) {
  formData.append('files', file);  // same field name, repeated
}

// Legacy (still works):
// formData.append('image', singleFile);
```

### Per-model attachment limits (premium / free)

| Provider | Free max | Premium max |
|----------|----------|-------------|
| All (default) | **2** | — |
| Gemini | 2 | **10** |
| OpenAI | 2 | **10** |
| Claude | 2 | **20** |
| Grok | 2 | **5** |

Server trims excess files silently. Show these limits in the UI.

### Supported MIME types
- All `image/*`
- `application/pdf`
- Word (`.doc`, `.docx`)
- Excel (`.xls`, `.xlsx`)
- `text/plain`, `text/csv`

Max **10 MB per file**.

### Frontend tasks (`answerEngine.ts`, `SearchBar.tsx`)

1. **Stop sending only the first file** — append all selected files as `files`.
2. Match UI limits to backend: free **2**, premium **5** (UI) / up to **20** on Claude.
3. Prompts like “describe these images” / “summarize these PDFs” work when files are attached.

---

## 3. Document analysis by model

| Provider | Images | PDF | Word/Excel/Text |
|----------|--------|-----|-----------------|
| **Gemini** | Native | Native inline | Native inline |
| **Claude** | Native | Native document block | Text extracted to prompt |
| **OpenAI** | Vision API | Text in prompt (extracted when plain/csv) | Text in prompt |
| **Grok 4.3** | Vision (OpenAI-style) | Text in prompt | Text in prompt |

No frontend change beyond multi-upload — routing is server-side.

---

## 4. Video from uploaded image

### `POST /api/media/generate-video`

When user uploads an image (video tool or from search):

1. **Multipart:** field `referenceImage` (unchanged)
2. **NEW JSON/FormData field:** `imageDataUrl` — base64 data URL from search/chat attachment

If an image is present and no video-to-video reference:
- Backend uses **Veo image-to-video** (`generateVideoFromImage`)
- Falls back to text-to-video with style reference if I2V fails

### Frontend example

```typescript
// Option A: file upload (existing)
formData.append('referenceImage', imageFile);

// Option B: pass attachment from search bar
formData.append('imageDataUrl', attachmentDataUrl);
formData.append('prompt', 'Animate this scene with gentle camera motion');
```

Dedicated endpoint unchanged: `POST /api/media/generate-video-from-image`

---

## 5. Silent model failover (no UI change)

If the selected model errors (404, timeout, rate limit, empty response), the backend **automatically tries other models** without telling the user.

- User still sees their selected model in the UI
- Response always uses the **requested** `model` field in the API response metadata if you send it — backend does not expose which model actually answered (by design)

**Do not** show “model switched” toasts — failover is invisible.

---

## 6. TypeScript types to sync

Update `src/types/index.ts`:

```typescript
export interface FileAttachment {
  dataUrl: string;
  mimeType: string;
  filename?: string;
}

export type LLMModel =
  | 'auto'
  | 'gpt-5' | 'gpt-5.1' | 'gpt-5.2' | 'gpt-5.3'
  | 'gpt-5.4' | 'gpt-5.5' | 'gpt-5.5-pro'
  | 'gpt-4.1' | 'gpt-4.1-mini' | 'gpt-4.1-nano'
  | 'o3' | 'o4-mini'
  | 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-4' | 'gpt-3.5-turbo'
  | 'gemini-2.0-latest' | 'gemini-3.0' | 'gemini-3.1' | 'gemini-3.1-flash'
  | 'gemini-3.5-flash' | 'gemini-3.1-flash-lite' | 'gemini-lite'
  | 'claude-4.8-opus' | 'claude-4.7-opus'
  | 'claude-4.5-sonnet' | 'claude-4.5-opus' | 'claude-4.6-sonnet' | 'claude-4.6-opus'
  | 'claude-4.5-haiku' | 'claude-4-sonnet' | 'claude-4-opus' | 'claude-4.1-opus' | 'claude-3-haiku'
  | 'grok-4.3' | 'grok-4.20' | 'grok-3' | 'grok-3-mini'
  | 'grok-4-heavy' | 'grok-4-fast' | 'grok-code-fast-1' | 'grok-beta'
  | 'gemini-pro' | 'gemini-pro-vision' | 'llama-2' | 'mistral-7b';
```

---

## 7. Checklist for frontend team

- [ ] Add new models to `LLMModelSelector.tsx` (grouped by provider)
- [ ] Sync `LLMModel` union in `src/types/index.ts`
- [ ] Update `answerEngine.ts`: send all files as `files` field
- [ ] Show per-tier file count limits in `SearchBar` attachment UI
- [ ] Video tool: pass `imageDataUrl` when animating a search attachment
- [ ] No UI for model failover (backend handles silently)
- [ ] Test: multi-image “describe these”, multi-PDF on Claude/Gemini

---

## 8. Deploy

Backend only — after pull:

```bash
cd server && npm run build && pm2 restart perle-backend
```

Frontend can ship independently; legacy single `image` upload remains compatible.
