# Context Check — Codebase Map (End-to-End)

> **Purpose:** Single source of truth describing what exists in this codebase, how the
> frontend and backend fit together, and where things live. Keep this file updated with
> every meaningful change (new route, new page, new env var, schema change, etc.).
>
> **How to maintain:** When you add/remove/rename a file, route, env var, DB table, or
> change a core flow, update the relevant section below **and** add a line to the
> [Changelog](#changelog) at the bottom. Keep entries terse and factual.
>
> Last verified: 2026-06-19

---

## 1. What this product is

**Perle / SyntraIQ** — a Perplexity-style AI answer engine delivered as a **mobile web app**
(React + Vite + TypeScript) wrapped with **Capacitor** for native iOS/Android builds.

Core features:
- AI **search** (non-streaming `/search` + SSE streaming `/stream`) with web search + citations
- Conversational **chat** with modes: `normal`, `ai_friend`, `ai_psychologist`, `space`
- **AI Friends** (custom personas w/ memory), **AI Psychologist**, **Spaces** (workspaces w/ files)
- **Media studio**: image generation/editing + video generation (text→video, image→video)
- **Discover** feed, **Library** (saved items), **Gallery** (generated media)
- **Subscriptions** via dual providers: **Razorpay** (India) + **Stripe**, tiers: `free` / `pro` / `max`
- Voice input/output overlay

Branding note: code/storage keys use **`syntraiq-*`**; legacy keys were **`perle-*`** (migrated in
`src/utils/storage.ts`). App ID `com.syntraiq.com`, app name `SyntraIQ`.

---

## 2. Repository layout

```
/  (frontend root — package "perle-mobile" v1.0.1)
├── src/                      # React app (see §4)
├── perle/server/            # Backend — package "perle-backend" v1.0.0 (see §3)
├── android/, ios/           # Capacitor native projects
├── android_backup/          # old android project copy
├── dist/                    # frontend build output
├── public/, assets/, icons/, resources/   # static assets
├── release_builds/          # APK/build artifacts v1.0.2–v1.0.6
├── skyreels-runpod/         # (separate) video-gen runpod scripts
├── perle-server.tar.gz      # 26MB archived copy of server (mid-restructure artifact)
├── capacitor.config.ts, vite.config.ts, tailwind.config.ts, vercel.json
└── context_check.md         # THIS FILE
```

> ⚠️ **Repo hygiene note:** `git status` shows the old root `server/` tree as deleted; live
> backend code now lives in `perle/server/`. There is also a 26MB `perle-server.tar.gz` at root.
> Looks like an in-progress move — clean up when convenient.

---

## 3. Backend — `perle/server`

**Stack:** Express 4, TypeScript (ESM — `"type":"module"`, imports use `.js` ext), Supabase
(`@supabase/supabase-js`), Zod, Multer. Dev: `tsx watch`. Build: `tsc`. Runs on `PORT` (default 3333).

**AI SDKs:** `openai`, `@google/generative-ai`, `@anthropic-ai/sdk`, Grok/xAI via OpenAI-compatible API.
**Search:** Exa, Gemini grounding, OpenAI/Grok web tools, Azure AI Foundry + Bing grounding.
**Payments:** `razorpay`, `stripe`. **Email:** Resend.

### 3.1 Entry — `src/index.ts`
- Mounts all routers under `/api`. Health check at `/api/health`.
- CORS from `CORS_ORIGIN`/`CORS_ORIGINS` (comma-sep); allows no-origin (mobile/curl).
- Stripe webhook (`/api/payment/stripe/webhook`) uses `express.raw()` **before** `express.json()`.
- JSON limit `2mb`. Hourly `cleanupExpiredSessions()`. Self-ping `/api/health` every 30s to keep Render warm.

### 3.2 Auth — `src/middleware/auth.ts` + `src/routes/auth.ts`
- Auth delegated to **Supabase Auth** (Bearer access token; refresh via `x-refresh-token` header).
- Middlewares: `authenticateToken` (hard 401), `optionalAuth` (continues anonymous).
- **Silent token refresh**: returns new tokens in `X-New-Access-Token` / `X-New-Refresh-Token` /
  `X-New-Expires-At` response headers; frontend stores them.
- Signup → Supabase emails **8-digit OTP** → `verify-otp`. Password policy via Zod (≥6, upper+lower+number).
- Login & verify both run **subscription-expiry auto-downgrade** logic (duplicated ~60 lines — refactor candidate).

### 3.3 Routes (all under `/api`)
| File | Endpoints (method path) |
|------|--------------------------|
| `search.ts` | POST `/search`, POST `/stream` (SSE), GET `/suggestions`, GET `/related`, GET/DELETE `/search/history` |
| `chat.ts` | POST `/chat`, GET `/chat/history` |
| `conversations.ts` | GET/POST `/conversations`, GET/PATCH/DELETE `/conversations/:id` |
| `auth.ts` | POST `/auth/signup`,`/auth/verify-otp`,`/auth/resend-otp`,`/auth/login`,`/auth/logout`,`/auth/refresh`; GET `/auth/verify` |
| `profile.ts` | GET/PUT/DELETE `/profile`, POST `/profile/upload-picture`, GET `/profile/export` |
| `library.ts` | GET `/library`, GET `/library/:id`, POST `/library`, PATCH/DELETE `/library/:id` |
| `media.ts` | POST `/media/generate-image`, `/media/generate-video`, `/media/generate-video-from-image`; GET `/media/gallery`,`/media/quota`,`/media/my-media`; DELETE `/media/:id`; GET `/media/proxy-video/:fileId`,`/media/proxy-openai-video/:videoId` |
| `payment.ts` (Razorpay) | POST `/payment/create-subscription`,`/payment/verify-prorated`,`/payment/verify-subscription`,`/payment/webhook`,`/payment/toggle-auto-renew`,`/payment/cancel`; GET `/payment/subscription` |
| `stripe.ts` | POST `/payment/stripe/create-checkout-session`, POST `/payment/stripe/webhook` |
| `aiFriends.ts` | GET `/ai-friends`,`/ai-friends/default-logos`,`/ai-friends/:id`; POST `/ai-friends`,`/ai-friends/upload-logo`; PUT/DELETE `/ai-friends/:id` |
| `spaces.ts` | GET `/spaces`,`/spaces/public`,`/spaces/default-logos`,`/spaces/:id`,`/spaces/:id/files`; POST `/spaces`,`/spaces/upload-logo`,`/spaces/:id/upload-file`; PUT/DELETE `/spaces/:id`; DELETE `/spaces/:spaceId/files/:fileId` |
| `admin.ts` | POST/GET `/admin/users/:userId/premium`, GET `/admin/users/premium` (gated by `ADMIN_USER_IDS`) |
| `discover.ts` | GET `/discover`, GET `/discover/:id`, POST `/discover/article` |

### 3.4 Backend utils — `src/utils/`
- **`aiProviders.ts`** (~1.8k lines, the core): `generateAIAnswer()` (router w/ silent fallback chain),
  `streamGeminiAnswer()` (SSE generator), and per-provider `generateOpenAI/Gemini/Claude/GrokAnswer()`.
  Handles prompt building, markdown stripping (preserves tables), Compare/list table formatting,
  premium-detail prompts, self-referential queries, image-gen trigger in normal mode.
  Signature: `generateAIAnswer(query, mode, model, isPremium, history, chatMode, friendDescription,
  friendName, friendMemoryContext, spaceTitle, spaceDescription, imageDataUrl, userContext, searchType, attachments)`.
- **`modelRegistry.ts`**: maps UI model IDs → real provider model IDs. Many **fictional/future labels**
  (`gpt-5.5`, `gemini-3.5-flash`, `claude-4.8-opus`, `grok-4.3`) resolve to real models (`gpt-4o`,
  `gemini-2.5-flash-lite`, `claude-sonnet/opus-*`, etc.). `getSilentFallbackChain()`,
  `getMaxAttachments()`, `LLM_MODEL_ENUM` (Zod source of truth for allowed models).
- **`webSearch.ts`**: decides *whether* to web-search — `requiresCurrentInfo`, `shouldPerformWebSearch`,
  `isSmallTalkQuery`, `isComparisonQuery`, `isListQuery`, `isContinuationFollowUpQuery`, etc.
- **`providerWebSearch.ts`**: executes search via `searchWithExa`, `searchWithGeminiGrounding`,
  `searchWithOpenAIWebTool`, `searchWithGrokWebTool`.
- **`azureGroundingSearch.ts`**: Azure AI Foundry + Bing grounding search.
- **`imageGeneration.ts`**: `shouldGenerateImage`, `generateImageWithGemini`, `...WithOpenAIGPTImageEdit`,
  `...WithDALLE`, `generateImage` (router).
- **`videoGeneration.ts`**: `generateVideoWithGemini` (Veo), `generateVideoWithOpenAI` (Sora), `generateVideo`,
  `generateVideoFromImage`, Gemini File API upload.
- **`mediaHelpers.ts`**: edit-request detection, last-generated image/video lookup, save media to history.
- **`fileAttachments.ts`**: upload mime allowlist, `processUploadedFiles` (→ Supabase storage),
  `enforceAttachmentLimit`, per-provider content builders (OpenAI/Gemini/Claude/Grok).
- **`uploadConfig.ts`**: Multer config — `MAX_UPLOAD_BYTES = 10MB`/file, `uploadSearchFiles` (`files` field).
- **`aiFriendMemory.ts`**: extract/merge/format persistent memory for AI Friends.
- **`requestLocalContext.ts`**: `buildUserLocalContext` (merges client locale/timezone w/ request headers).
- **`auth.ts`** (bcrypt/session helpers — legacy custom auth), **`otp.ts`**, **`email.ts`** (Resend),
  **`razorpayPlans.ts`**, **`errorHandler.ts`**, **`discoverModels.ts`**, **`openai.ts`**, **`answerEngine.ts`**.

### 3.5 Database (Supabase Postgres) — `perle/server/database/*.sql`
Tables: `users`, `user_profiles`, `sessions`, `email_otps`, `conversations`, `conversation_history`,
`search_history`, `library_items`, `ai_friends`, `ai_friend_user_memory`, `spaces`, `space_files`,
`generated_media`. Schema is split across many incremental `add_*.sql` / `fix_*.sql` migrations
(base = `schema.sql`). Storage buckets + RLS policies in `create_storage_buckets.sql`,
`storage_policies.sql`, `create_profile_pics_bucket.sql`.

### 3.6 Premium gating logic (important)
- Free users: model forced to `gemini-lite`; `auto` also → `gemini-lite`.
- Context window (history messages): anon **5** / free **10** / premium **20**.
- Max attachments: free **2**; premium varies by provider (Claude 20, Gemini/OpenAI 10, Grok 5).
- Subscription expiry auto-downgrades `premium_tier`→`free` on login/verify.

---

## 4. Frontend — `src/` (package `perle-mobile`)

**Stack:** React 18, Vite (dev port 3000), React Router v7, Tailwind v4, Three.js /
react-three-fiber (globe), Motion (animations), Capacitor. Tests: Vitest + Testing Library (jsdom).
**API base:** `VITE_API_URL` (required at runtime).

### 4.1 Shell
- `main.tsx` → `App.tsx`: `BrowserRouter` → `RouterNavigationProvider` → `ToastProvider` →
  `SplashScreen` (1.8s) → `AppRouter`. On mount inits theme + auth session listeners.
- `components/Router.tsx`: ~30 routes. `MAINTENANCE_MODE` flag short-circuits to maintenance page.

### 4.2 Routes → Pages (`src/pages/`)
| Path | Page | Notes |
|------|------|-------|
| `/` | `HomePage` | wraps `ChatWorkspace` (main search/chat) |
| `/home` | `LandingPage` | marketing/landing |
| `/discover` | `DiscoverPage` | news/discover feed |
| `/profile` | `ProfilePage` | account, settings, subscription (2k lines) |
| `/library` | `LibraryPage` | saved items |
| `/spaces` | `SpacesPage` | workspaces + files |
| `/ai-friend` | `AIFriendPage` | custom AI personas (2k lines) |
| `/ai-psychology` | `AIPsychologyPage` | AI psychologist chat |
| `/upgrade` | `UpgradePlansPage` | plan selection |
| `/subscription` | `SubscriptionPage` | manage subscription |
| `/details/:id` | `DetailsPage` | discover article detail |
| `/verify` | `VerificationPage` | OTP verification |
| `/gallery` | `GalleryPage` | generated media |
| `/analyze` | `AnalyzeDocumentPage` | document analysis |
| `/create`, `/create-video`, `/edit-images` | `MediaStudioPage` | media generation |
| `/sleep-disorders` | `SleepDisorderPage` | themed content page |
| legal/info | `Terms/Privacy/About/Help/Contact/Support/RefundCancellation/Maintenance` | static |
| `*` | redirect → `/` | |

Other pages present but not directly routed in some configs: `CreateVideoPage`, `EditImagesPage`.

### 4.3 Key components (`src/components/`)
- **`SearchBar.tsx`** (~2.8k lines) — central input: query, file upload, model picker, voice, modes.
- **`AnswerCard.tsx`** (~2.1k lines) — renders streamed answers, citations, sources, tables.
- **`LLMModelSelector.tsx`** — model dropdown (free vs premium gating).
- **`VoiceOverlay.tsx`** / `VoiceOverlayControls` / `VoiceResponseText` — voice in/out.
- **`ConversationSidebar.tsx`**, `Header.tsx`, `ModeBar.tsx`, `ExperienceModeButtons.tsx`.
- **`LoginForm.tsx`**, `SignupForm.tsx`, `AIDataConsentModal.tsx` (consent: `hasAIConsent`/`grantAIConsent`).
- **`SourcesPill.tsx`**, `SourceChip.tsx`, `DiscoverRail.tsx`, `Library.tsx`, `UpgradeCard.tsx`,
  `MediaStudioModal.tsx`, `Toast.tsx`, `SplashScreen.tsx`, `OfflineIndicator.tsx`, `ChatDateDivider.tsx`,
  `ui/globe.tsx` (three-globe).

### 4.4 API layer (`src/utils/answerEngine.ts` + `src/utils/mediaApi.ts`)
- `searchAPI` (multipart, supports files), `searchAPIStream` (SSE: parses `meta`/`sources`/`token`/
  `done`/`error`), `chatAPI`, `getSearchSuggestions`, `getRelatedQueries`.
- `mediaApi.ts`: `generateImageApi`, `generateVideoApi`.
- All read `VITE_API_URL`, attach auth headers, and persist rotated tokens from response headers.
- `fakeAnswerEngine` still present as offline/dev fallback.

### 4.5 Frontend utils (`src/utils/`)
- **`auth.ts`** — `User`/`AuthResponse` types, token get/set, `setAuthCredentials`,
  theme (`applyTheme`/`initializeTheme`), `getAuthHeaders`, `saveTokensFromResponseHeaders`,
  `initializeAuthSession`, session listeners.
- **`storage.ts`** — `STORAGE_KEYS` (all `syntraiq-*`), legacy `perle-*` migration, local/session helpers,
  auth-token keys.
- **`queryLimit.ts`** — `FREE_DAILY_QUERY_LIMIT = 4`, daily count tracking, `hasReachedDailyQueryLimit`.
- **`userLocalContext.ts`** — locale/timezone/country/currency payload sent with requests.
- **`homeChatSession.ts`** — persisted chat snapshots (`homeChatStore`, `analyzeDocStore`).
- **`answerFormatting.tsx`** — citation/heading/inline markdown rendering helpers.
- **`helpers.ts`** (rerankSources, chunkAnswer, debounce/throttle), `chatDates.ts`, `chatScroll.ts`,
  `imagePicker.ts`, `platformInsets.ts` (iOS safe-area).

### 4.6 Services / Contexts / Hooks
- Services: `discoverService.ts` (categories, nation news), `discoverArticleService.ts`, `iapService.ts`
  (in-app purchase — `IAP_PRODUCT_IDS`).
- Contexts: `RouterNavigationContext` (active), `NavigationContext` (legacy), `ToastContext`.
- Hooks: `useMobile` (`useMobile`, `usePullToRefresh`, `useHaptic`, `useSafeArea`).

### 4.7 Types (`src/types/index.ts`)
Mirrors backend `types.ts` (Mode, LLMModel union, Source, AnswerResult, ChatResult, etc.) plus
frontend-only `ExperienceMode`, `UploadedFile`, `LibraryItem`. Note frontend LLMModel union also
includes `exa-auto`/`exa-instant`/`exa-deep`.

---

## 5. Environment variables

**Backend (`perle/server/.env`):**
`PORT`, `NODE_ENV`, `CORS_ORIGIN`, `CORS_ORIGINS`, `FRONTEND_URL`, `SERVER_URL`, `RENDER_EXTERNAL_URL`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`OPENAI_API_KEY`, `OPENAI_VIDEO_MODEL`, `GOOGLE_API_KEY`, `GOOGLE_API_KEY_FREE`, `GEMINI_API_KEY_FREE`,
`ANTHROPIC_API_KEY` / `CLAUDE_API_KEY`, `XAI_API_KEY` / `X_API_KEY`, `EXA_API_KEY`,
`AZURE_AI_FOUNDRY_PROJECT_ENDPOINT`, `AZURE_BING_CONNECTION_ID`, `AZURE_MODEL_DEPLOYMENT_NAME`,
`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_ID_PRO`, `RAZORPAY_PLAN_ID_MAX`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_MAX`,
`RESEND_API_KEY`, `ADMIN_USER_IDS`.

**Frontend:** `VITE_API_URL` (backend base URL).

---

## 6. Build / run

```bash
# Frontend (root)
npm run dev            # vite dev @ :3000
npm run build          # tsc && vite build → dist/
npm test               # vitest

# Backend
npm run server:dev     # = npm --prefix server ...  (NOTE: scripts point at ./server)
# Direct: cd perle/server && npm run dev   (tsx watch @ :3333)

# Native (Capacitor)
npx cap sync && npx cap open ios|android
```

> ⚠️ Root `package.json` server scripts use `--prefix server` but backend now lives at
> `perle/server`. Verify/update these scripts.

---

## 7. Known rough edges / refactor candidates
- `/search` vs `/stream` duplicate premium-check, history-fetch, attachment handling.
- `auth.ts` login/verify duplicate the ~60-line subscription-expiry block.
- Model registry uses fictional UI names mapped to real models — keep in mind when debugging
  "which model answered" (silent fallback hides it).
- Repo mid-restructure: deleted root `server/`, live `perle/server/`, plus `perle-server.tar.gz`.
- Root `package.json` `server:*` scripts path mismatch (`server` vs `perle/server`).

---

## Changelog
> Add newest entries at top. Format: `YYYY-MM-DD — change — files touched`.

- 2026-06-20 — UX fixes batch: (1) **news tag classifier** rewritten with word-boundary regex
  (`\b…\b`) + Politics/Crime check before Tech/Finance — fixes "Mumbai" being tagged Tech because
  of `/ai/` matching mid-word, "Bengal Police bank probe" being Finance because of bare "bank",
  etc. (2) **"25 sources" pill** replaced with plain "Sources" label (favicon stack stays).
  (3) **Streaming card no longer flashes raw markdown** — new `maskStreamingMarkdown` in
  `AnswerCard.tsx` collapses in-progress `| col | col |` rows into a brief "⏳ Building table…"
  placeholder until streaming completes and the proper renderer takes over. (4) **Premium answers
  now richer EVEN for table/comparison queries** — `getSystemPrompt` no longer skips the
  `PREMIUM_DEPTH_SYSTEM_ADDON` when `forTableFormat`; comparison prompts also instruct premium
  to emit Verdict + When-to-choose-A + When-to-choose-B + Key-Takeaways sections after the table.

- 2026-06-20 — Removed static fallback from Discover news: `src/services/discoverService.ts`
  `fetchLiveNewsItems` now returns `[]` (and console.errors the reason) on any failure instead of
  falling back to `NATION_NEWS_POOL`. No fake "UK Parliament Updates" placeholders ever again — the
  feed is either real news from `/api/discover/news` or empty (UI handles empty). Full FE prod
  build + BE rebuild + server restart. Verified live for IN/GB/BR/JP: 16 real headlines each.
- 2026-06-20 — "Invalid request" + contextual follow-ups: `ChatWorkspace.doSearch` filters empty
  query/assistant content from `localConversationHistory` (prevents server zod `min(1)` failure on
  `content: ""`). `streamGeminiAnswer` now also repeats the `SUGGESTED_FOLLOWUPS:` instruction at
  the END of the user prompt (was buried under 5KB+ of search context → small models skipped it).

- 2026-06-20 — Summary cross-provider fallback: `utils/contextCompression.ts` `buildSummary` now
  tries Gemini Flash Lite → OpenAI gpt-4o-mini → Claude Haiku 4.5 → Grok-3-mini, each capped at
  8s, each going through `getApiKey` (so multi-key rotation + cooldown still apply per provider).
  Rate-limit errors park the offending key. Returns null only when ALL configured providers fail.

- 2026-06-20 — Redis cache layer + DB-backed conversation summaries (Perplexity-style):
  **Redis:** new `perle/server/src/lib/redis.ts` (ioredis wrapper, activates only when `REDIS_URL` set,
  graceful no-op otherwise). `SEARCH_CACHE` in `aiProviders.ts` migrated to L1 in-memory (60s) +
  L2 Redis (**15 min**), keyed `search:{q}`. `NEWS_CACHE` in `discoverNews.ts` migrated to L1 (60s) +
  L2 Redis (**30 min**), keyed `news:{COUNTRY}`. Added `ioredis@^5.11.1` to backend deps and
  documented `REDIS_URL` in `.env.example`. **Conversation compression:** new
  `database/add_conversation_summary.sql` adds `summary` + `summary_message_count` to
  `conversations`; new `utils/contextCompression.ts` `buildCompressedContext` returns
  `{ summary, recent }` — verbatim window **Free 5 / Pro 10 / Max 15** + persisted rolling summary
  of everything older (built via Gemini Flash Lite, cached on the `conversations` row, regenerated
  only when stale). Threaded `priorSummary` through `getSystemPrompt` (single injection point,
  📜 EARLIER CONVERSATION SUMMARY block) → all providers (`generateOpenAIAnswer`,
  `generateGeminiAnswer`, `generateClaudeAnswer`, `generateGrokAnswer`, `streamGeminiAnswer`) +
  `routeAIAnswerForModel`/`generateAIAnswer`/`streamAIAnswer`. `/search` and `/stream` in
  `routes/search.ts` now call `buildCompressedContext` instead of fetching last-N raw. `routes/chat.ts`
  upgraded to the same tiered verbatim window; summary path deferred for chat (history isn't
  uniformly keyed to a single `conversations.id`). **All graceful**: works with no `REDIS_URL` and
  pre-migration columns; verified end-to-end stream (first token 4.3s, no errors).
  **ACTION REQUIRED to activate summaries**: run `database/add_conversation_summary.sql` in Supabase.

- 2026-06-20 — Server-side free-tier enforcement (logged-in users): new
  `perle/server/src/utils/usageLimits.ts` (lifetime `free_search_used`<=4, `free_deep_used`<=1) +
  migration `database/add_usage_counters.sql` (columns + atomic increment RPCs). `/search` and
  `/stream` now 403 a free logged-in user past their limit (deep checked before SSE headers) and
  record usage after a successful answer. GRACEFUL: if the migration isn't run yet, counters read 0
  and nothing is blocked. Anonymous users can't be server-tracked (no identity) → keep the
  client-side gate. **ACTION REQUIRED: run `database/add_usage_counters.sql` in Supabase to activate.**
  Frontend: `searchAPI`/`searchAPIStream` (`src/utils/answerEngine.ts`) attach `limitReached`/
  `limitKind` on a 403; `ChatWorkspace.doSearch` catch routes such cases to `/subscription` with the
  deep/search message instead of a generic error.

- 2026-06-20 — Free deep-research limit (1 lifetime use): `src/utils/queryLimit.ts`
  `FREE_LIFETIME_DEEP_LIMIT=1` (+ `hasReachedLifetimeDeepLimit`/`incrementLifetimeDeepCount`/
  `getDeepLimitMessage`). `ChatWorkspace.doSearch` blocks a free user's 2nd deep research → routes to
  /subscription with the deep message; increments on use. Deep research KEEPS streaming word-by-word
  (just slower to first token = the "thinking" phase). Other lifetime limits unchanged.

- 2026-06-20 — Deep research = longer + in-depth (all models kept, NOT forced to Claude):
  `aiProviders.ts` `getEffectiveTokenLimit` gains a `deepResearch` flag (free 8000, premium 16000
  tokens) wired into every provider via `searchType === 'deep'`; new `DEEP_RESEARCH_SYSTEM_ADDON`
  (5–9 emoji sections, sub-bullets, tables, key-takeaways) appended via `getSystemPrompt(..., deep)`.
  Verified: deep answer 6308 chars / ~7 sections vs normal 1899 / ~3. Note: Gemini streaming caps
  output at 8192/call, so premium's full 16000 only applies on non-Gemini models. `claude-4.8-opus`
  already selectable (in model registry) — nothing to add.
- 2026-06-20 — Download fix (web + best-effort native): new `src/utils/downloadMedia.ts` (native
  share sheet → save; web anchor download; URL-open fallback). Wired into `GalleryPage` (list +
  detail) and `MediaStudioPage`. Replaces the `<a download>` pattern that was a no-op in the native
  WebView. Full native "save to gallery" would need `@capacitor/filesystem`+`@capacitor/share`
  plugins (not installed — left out per request, since that's the mobile-app-specific part).

- 2026-06-20 — Key rotation cooldown: `apiKeys.ts` now parks a key for 60s when it returns a
  rate-limit error (`reportRateLimit`/`reportRateLimitForProvider`); `getApiKey` skips cooling-down
  keys during round-robin (falls back to next if all cooling). Wired into the rate-limit catch points
  in `aiProviders.ts` (`streamGeminiAnswer` + `generateAIAnswer` chain). No-op for single-key setups.
  Added `perle/server/.env.example` documenting the multi-key naming convention.

- 2026-06-20 — Per-tier conversation cap + delete UX: new `perle/server/src/utils/conversationLimits.ts`
  (`enforceConversationLimit`, limits free:20 / pro:500 / max:5000). Wired into `routes/search.ts`
  `/search` + `/stream` — when a NEW conversation is created, oldest beyond the user's plan limit are
  auto-deleted (non-blocking). `src/components/ConversationSidebar.tsx` delete button is now always
  visible (was hover-only → invisible on mobile); per-conversation delete already existed via
  `DELETE /api/conversations/:id`.

- 2026-06-19 — CRITICAL data-loss fix: `routes/search.ts` was deleting the user's ENTIRE
  `conversation_history` (all conversations) on every `newConversation=true` — removed it. That's
  why old chats reloaded empty (DB diag: 2443 conversations, only 40 history rows). Also raised the
  per-conversation storage prune 10/20 → 200 so full chats reload (LLM context still limited
  separately). NOTE: history deleted before this fix is already gone; new chats now retain history.
- 2026-06-19 — API key rotation: new `perle/server/src/utils/apiKeys.ts` (`getApiKey`/`keyCount`/
  `hasKeyRotation`). Round-robins across multiple keys per provider; with a single key it returns
  that key (default behavior unchanged). Extra keys via numbered suffixes (`OPENAI_API_KEY_2…`) or
  comma lists (`OPENAI_API_KEY=k1,k2`). Wired into `aiProviders.ts` (all LLM + web-search key reads)
  and `discoverNews.ts`. Verified: 1 key → no rotation; 3 keys → keyA→keyB→keyC→keyA.

- 2026-06-19 — Sources = single compact pill only: `src/components/AnswerCard.tsx` strips inline
  `[n]` citation markers (no inline badges in the answer text) and removed the per-chunk titled
  `SourceChip` cards. Bottom sources render ONLY the `SourcesPill` (favicon-stack "N sources" pill
  that taps to expand the list) — per user: keep that pill + its expanded list, drop everything
  inline. `SourceChip.tsx` no longer used by AnswerCard.

- 2026-06-19 — Favicon-based citations/sources (Perplexity-style): `CitationBadge` in
  `src/components/AnswerCard.tsx` and the badge in `src/components/SourceChip.tsx` now render the
  source's `SourceFavicon` (logo) instead of a bare golden number (number kept only as fallback when
  the source/url is unknown). Imported `SourceFavicon` into both.

- 2026-06-19 — Answer-quality + speed fixes from UI review: (1) `src/utils/answerFormatting.tsx`
  `stripHeadingEmojis` no longer strips the LEADING topic emoji — headings now render "📱 …" as
  intended (frontend was deleting the emoji the backend produced). (2) Contextual follow-up
  questions: `streamGeminiAnswer` now instructs the model to append `SUGGESTED_FOLLOWUPS: q || q || q`
  tied to the actual answer; the stream suppresses the marker line and parses real follow-ups
  (verified: "How does the Samsung Exynos 2600 compare to the Snapdragon 8 Elite Gen 5…"). Falls back
  to templates only if parsing fails. (3) Degraded-search speed: when Exa is unavailable the stream
  searches via OpenAI's web tool (not rate-limited Gemini grounding) with a 9s cap — first token
  24s→11s under the current Exa-out-of-credits / Gemini-503 conditions (≈3s when Exa funded).
  NOTE: Exa key currently returns HTTP 402 (out of credits) — fund it to restore ~3s search.

- 2026-06-19 — Search reuse on fallback: added a 90s in-memory `SEARCH_CACHE` in
  `perle/server/src/utils/aiProviders.ts` keyed by the shared `searchQuery`. `streamGeminiAnswer`
  and `performWebSearch` populate it; `performWebSearch` reads it first — so a cross-provider
  fallback reuses the primary's search instead of re-searching. Verified: forced Gemini outage
  fallback dropped 16.9s → 8.3s (log: "♻️ reusing 25 cached result(s)"), Apple present.

- 2026-06-19 — Rate-limit resilience (no more 59s stalls): `perle/server/src/utils/aiProviders.ts` +
  `modelRegistry.ts`. (1) `getSilentFallbackChain` now always includes CROSS-PROVIDER backups for
  free users too (was Gemini-only → total failure on Gemini 503). (2) `streamGeminiAnswer` stream
  start wrapped in 12s timeout and fails FAST on rate-limit (no SDK retry backoff, no same-model
  retry). (3) `generateAIAnswer` chain: per-model 22s timeout + on rate-limit skips remaining
  same-provider models and jumps to a different provider. Added `isRateLimitError`/`providerOf`
  helpers. Verified: forced Gemini outage → cross-provider fallback to gpt-4o-mini in 16.9s (was 59s)
  with full answer incl. Apple; happy path first-token 1.65s, done 3.77s.

- 2026-06-19 — Correctness for ALL tiers (free + premium): hardened table rules in
  `perle/server/src/utils/aiProviders.ts` — `TABLE_FORMAT_SYSTEM_ADDON` now bans empty/`-`/`N/A`/
  placeholder cells outright and adds a COMPLETENESS rule (include every obvious major player from
  the model's own knowledge, e.g. Apple in "latest mobile processors"); same guidance added to the
  list-query user prompt in `buildNormalModeUserPrompt`. Verified free (gemini-lite) 4/4 runs: Apple
  present, zero empty cells, all 5 vendors.

- 2026-06-19 — Sources reveal only on the completed answer: streaming/loading `AnswerCard`s in
  `src/pages/ChatWorkspace.tsx` now pass `hideSources={true}`; the final answer (conversation history)
  still shows the `SourcesPill` at the bottom. Verified free-vs-premium live for "latest mobile
  processors": premium (isPremium=true) produced a richer 5-row table covering all vendors
  (Qualcomm/MediaTek/Apple/Samsung/Google) + 23 sources vs free's 4-row Qualcomm-mostly table + 6
  sources — confirming premium depth wiring works.

- 2026-06-19 — Streaming speed + cross-provider fallback (`perle/server/src/utils/aiProviders.ts`,
  `routes/search.ts`): (1) `streamGeminiAnswer` now does **Exa-first web search** (6s timeout) before
  falling back to Gemini grounding — verified time-to-first-token dropped 8.4s→3.0s, sources 7.3s→1.7s.
  (2) New `streamAIAnswer` wrapper streams Gemini, and on failure-before-first-token silently falls
  back to OpenAI→Grok→Claude via `generateAIAnswer`, replayed as tokens; `/api/stream` now calls it.
  Verified live: a forced Gemini-key failure fell back to `gpt-4o-mini` and still returned a full
  cited answer. Streaming/formatting (emoji headings, tables, bullets, citations-only-in-bullets,
  sources) confirmed correct via live SSE test.

- 2026-06-19 — Server-side region + no country limit for Discover news: exported
  `resolveRequestCountry()` from `perle/server/src/utils/requestLocalContext.ts` (IP/geo headers);
  `/api/discover/news` now leads with the IP-detected country, appends client hints, removed the
  8-country allow-list (any ISO alpha-2). `discoverNews.ts` labels any country via
  `Intl.DisplayNames`. Frontend `getUserNationCode`/`getUserRegionOrder` relaxed to any 2-letter
  region (client hint only); removed now-unused `NATION_LABELS`.

- 2026-06-19 — Region-aware + daily Discover news: `src/services/discoverService.ts` now detects
  the user's region across all 8 supported countries (locale → `navigator.languages` → timezone →
  US fallback) via `getUserNationCode()`/`getUserRegionOrder()`; `getForYouNews()` leads with the
  user's own region (no longer hard-limited to IN/US); live-news localStorage cache is scoped to
  `{date|region}` so it refreshes on a new day or region change. Backend already serves IN/US/GB/AU/
  JP/DE/CA/SG via `/api/discover/news`. Also fixed a pre-existing build break (missing `sources`
  prop on streaming loading `AnswerCard`) in `src/pages/ChatWorkspace.tsx`.

- 2026-06-19 — Live news in Discover "For You": new `perle/server/src/utils/discoverNews.ts`
  (Exa `category:news` → Gemini grounding fallback, 30-min server cache, topical image/tag mapping);
  new `GET /api/discover/news?country=IN,US` in `routes/discover.ts`; frontend
  `fetchLiveNewsItems()` (30-min localStorage cache, static fallback) wired into
  `getAllDiscoverItems()` in `src/services/discoverService.ts`; added optional `url`/`sourceDomain`
  to `DiscoverItem` in both `src/types/index.ts` and `perle/server/src/types.ts`.
- 2026-06-19 — Faster word-by-word answer streaming: adaptive drip in
  `src/pages/ChatWorkspace.tsx` `startDrip()` (reveals 4→40 chars/tick based on backlog so text
  never lags behind generation).
- 2026-06-19 — Created this context map (initial full end-to-end audit of frontend + backend).
