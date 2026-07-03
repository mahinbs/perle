import { Router } from 'express';
import { z } from 'zod';
import { generateAIAnswer, streamAIAnswer, buildLocalizedFallbackSuggestedQuestions, type GeminiStreamEvent } from '../utils/aiProviders.js';
import { resolveActualSearchModel } from '../utils/modelRegistry.js';
import type { AnswerResult, Mode, LLMModel, FileAttachment } from '../types.js';
import { supabase } from '../lib/supabase.js';
import { optionalAuth, type AuthRequest } from '../middleware/auth.js';
import { buildUserLocalContext } from '../utils/requestLocalContext.js';
import { uploadSearchFiles } from '../utils/uploadConfig.js';
import { LLM_MODEL_ENUM } from '../utils/modelRegistry.js';
import { enforceConversationLimit } from '../utils/conversationLimits.js';
import { checkFreeSearchAllowed, recordFreeSearchUsage } from '../utils/usageLimits.js';
import {
  getSubscriptionAccessForUser,
} from '../utils/subscriptionAccess.js';
import { buildCompressedContext } from '../utils/contextCompression.js';
import {
  collectUploadedFiles,
  processUploadedFiles,
  enforceAttachmentLimit,
  fileToDataUrl,
  resolveQueryWithAttachments,
} from '../utils/fileAttachments.js';

const router = Router();

const buildFallbackSuggestedQuestions = (query: string): string[] =>
  buildLocalizedFallbackSuggestedQuestions(query, 'normal');

const searchSchema = z.object({
  query: z.string().max(500, 'Query too long').default(''),
  mode: z.enum(['Ask', 'Research', 'Summarize', 'Compare']).default('Ask'),
  newConversation: z.boolean().optional().default(false), // Flag to start new conversation
  conversationId: z.union([z.string().uuid(), z.null()]).optional(), // Optional conversation ID to continue existing conversation (can be null)
  conversationHistory: z
    .preprocess((val) => {
      if (!Array.isArray(val)) return [];
      return val
        .map((m: any) => {
          const role = m?.role === 'assistant' ? 'assistant' : 'user';
          const raw = typeof m?.content === 'string' ? m.content : (m?.content == null ? '' : String(m.content));
          const content = raw.trim().slice(0, 12000);
          return { role, content };
        })
        .filter((m) => m.content.length > 0)
        .slice(-40);
    }, z.array(z.object({ role: z.enum(['user','assistant']), content: z.string() })))
    .optional()
    .default([]),
  userContext: z.object({
    locale: z.string().min(2).max(35).optional(),
    timeZone: z.string().min(1).max(80).optional(),
    localDateTime: z.string().min(1).max(200).optional(),
    countryCode: z.string().min(2).max(3).optional(),
    currencyCode: z.string().min(3).max(3).optional(),
    utcOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  }).optional(),
  model: z.enum(LLM_MODEL_ENUM).default('gemini-lite'),
  searchType: z.enum(['auto', 'instant', 'deep']).optional()
});

// Main search endpoint (supports file uploads)
router.post('/search', optionalAuth, uploadSearchFiles, async (req: AuthRequest, res) => {
  try {
    // Handle both JSON and form-data
    let bodyData = req.body;
    
    // Convert form-data string values to proper types
    if (bodyData.newConversation === 'true' || bodyData.newConversation === 'false') {
      bodyData.newConversation = bodyData.newConversation === 'true';
    }
    if (typeof bodyData.conversationHistory === 'string') {
      try {
        bodyData.conversationHistory = JSON.parse(bodyData.conversationHistory);
      } catch {
        bodyData.conversationHistory = [];
      }
    }
    if (typeof bodyData.userContext === 'string') {
      try {
        bodyData.userContext = JSON.parse(bodyData.userContext);
      } catch {
        bodyData.userContext = undefined;
      }
    }
    
    if (Array.isArray(bodyData?.conversationHistory)) {
      bodyData.conversationHistory = bodyData.conversationHistory
        .filter((m: any) => m && typeof m.content === 'string' && m.content.trim().length > 0
          && (m.role === 'user' || m.role === 'assistant'));
    }

    const parse = searchSchema.safeParse(bodyData);
    if (!parse.success) {
      console.warn('search: invalid request', JSON.stringify(parse.error.flatten().fieldErrors));
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { query, mode, model, newConversation, conversationId, conversationHistory: clientConversationHistory, userContext, searchType } = parse.data;
    const uploadedFilesEarly = collectUploadedFiles(req);
    const trimmedQuery = resolveQueryWithAttachments(query, uploadedFilesEarly.length);
    const effectiveUserContext = buildUserLocalContext(req, userContext);

    if (!trimmedQuery) {
      return res.status(400).json({ error: 'Query cannot be empty' });
    }

    console.log(`📨 Received: conversationId=${conversationId}, newConversation=${newConversation}`);

    // Handle conversation management
    let currentConversationId = conversationId;
    let createdNewConversation = false;

    // Create new conversation ONLY if:
    // 1. User explicitly clicks "New Chat" (newConversation=true)
    // 2. OR no conversationId provided (frontend will save it and send it next time)
    // DO NOT auto-use recent conversation - let frontend manage it
    if (req.userId && !currentConversationId) {
      try {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            user_id: req.userId,
            title: trimmedQuery.substring(0, 50) + (trimmedQuery.length > 50 ? '...' : ''),
            chat_mode: 'normal'
          })
          .select()
          .single();

        if (!convError && newConv) {
          currentConversationId = newConv.id;
          createdNewConversation = true;
          console.log(`✨ Created new conversation: ${currentConversationId}`);
        }
      } catch (convError) {
        console.warn('Failed to create conversation:', convError);
        // Continue without conversation ID
      }
    }
    
    // If conversationId provided, continue that conversation (keep context)
    if (currentConversationId) {
      console.log(`💬 Continuing conversation: ${currentConversationId}`);
    }

    // Check if user is premium (check premium_tier or is_premium for backward compatibility)
    let isPremium = false;
    let premiumTier = 'free';
    if (req.userId) {
      try {
        const access = await getSubscriptionAccessForUser(req.userId);
        isPremium = access.isPremium;
        premiumTier = access.premiumTier;
      } catch (e) {
        console.warn('Failed to fetch premium status, defaulting to free:', e);
      }
    }

    // Server-side free-tier enforcement (logged-in users; anon keeps client gate).
    if (req.userId && !isPremium) {
      const block = await checkFreeSearchAllowed(req.userId, searchType === 'deep');
      if (block) {
        return res.status(403).json({ error: block.message, limitReached: true, kind: block.kind });
      }
    }

    // Auto-prune old conversations beyond the user's plan limit (free:20, pro:500,
    // max:5000). Only when a NEW conversation was just created; non-blocking.
    if (req.userId && createdNewConversation) {
      void enforceConversationLimit(req.userId, isPremium ? premiumTier : 'free');
    }

    const actualModel = resolveActualSearchModel(model as LLMModel, isPremium);

    // Fetch conversation history for context
    // Non-logged: 5 messages (from client fallback only)
    // Verbatim window: Free 5 / Pro 10 / Max 15 most-recent messages. Everything
    // older is folded into a persisted summary so long chats don't lose context
    // (see buildCompressedContext). Anon users keep the 5-msg client-history path.
    const contextMessageLimit = !req.userId
      ? 5
      : premiumTier === 'max' ? 15
      : premiumTier === 'pro' ? 10
      : 5;
    let conversationHistory: any[] = [];
    let priorSummary: string | null = null;
    if (req.userId && currentConversationId && !newConversation) {
      try {
        const compressed = await buildCompressedContext(req.userId, currentConversationId, contextMessageLimit);
        conversationHistory = compressed.recent;
        priorSummary = compressed.summary;
      } catch (historyError) {
        console.warn('Failed to fetch compressed context:', historyError);
        // Continue without history if fetch fails
      }
    }

    // NOTE: Do NOT delete conversation_history on newConversation. History is
    // scoped per conversation_id, so a new chat simply gets its own id. The old
    // code here wiped ALL of the user's history across every conversation, which
    // destroyed past chats (that's why old conversations loaded empty).

    // Fallback context: if server-side history isn't available, use client-provided history
    if ((!conversationHistory || conversationHistory.length === 0) && clientConversationHistory.length > 0) {
      conversationHistory = clientConversationHistory.slice(-contextMessageLimit);
    }

    // Process uploaded files (images + documents) — multi-file supported
    let imageDataUrl: string | undefined = undefined;
    let attachments: FileAttachment[] | undefined;
    const uploadedFiles = collectUploadedFiles(req);
    if (uploadedFiles.length > 0 && req.userId) {
      try {
        console.log(`📎 ${uploadedFiles.length} file(s) attached in search`);
        const processed = await processUploadedFiles(uploadedFiles, req.userId, 'search-attachments');
      attachments = enforceAttachmentLimit(processed, actualModel, isPremium);
      if (attachments.length > 1) {
        console.log(`📎 Multi-file analysis (${attachments.length}): ${attachments.map((a) => a.filename).join(', ')}`);
      }
      const firstImage = attachments.find((a) => a.mimeType.startsWith('image/'));
        if (firstImage) imageDataUrl = firstImage.dataUrl;
      } catch (fileError) {
        console.error('Failed to process attachments:', fileError);
      }
    } else if (uploadedFiles.length > 0) {
      attachments = uploadedFiles.map((f) => ({
        dataUrl: fileToDataUrl(f),
        mimeType: f.mimetype,
        filename: f.originalname,
      }));
      attachments = enforceAttachmentLimit(attachments, actualModel, isPremium);
      const firstImage = attachments.find((a) => a.mimeType.startsWith('image/'));
      if (firstImage) imageDataUrl = firstImage.dataUrl;
    }

    // Generate answer (silent model failover handled in generateAIAnswer)
    let result: AnswerResult;
    try {
      result = await generateAIAnswer(
        trimmedQuery, mode as Mode, actualModel, isPremium, conversationHistory,
        'normal', null, null, null, null, null,
        imageDataUrl, effectiveUserContext, searchType as any, attachments, priorSummary
      );
    } catch (apiError: any) {
      console.error('AI provider error:', apiError);
      const errorMessage = apiError?.message || 'Failed to generate answer';
      // Return specific error message to help debug
      return res.status(500).json({ 
        error: errorMessage,
        details: apiError?.message?.includes('API_KEY') 
          ? 'API key is missing or invalid. Please check your GOOGLE_API_KEY_FREE in .env file.'
          : undefined
      });
    }

    // Save to search history if user is authenticated
    if (req.userId) {
      try {
        await supabase
          .from('search_history')
          .insert({
            user_id: req.userId,
            query: trimmedQuery,
            mode,
            timestamp: new Date().toISOString()
          });
      } catch (historyError) {
        // Log but don't fail the request if history save fails
        console.error('Failed to save search history:', historyError);
      }
      
      // Save to conversation history for context (store answer text)
      // Both free and premium users save history (different limits applied)
      try {
        const answerText = result.chunks.map(c => c.text).join('\n\n');
        await supabase
          .from('conversation_history')
          .insert({
            user_id: req.userId,
            query: trimmedQuery,
            answer: answerText,
            mode: mode,
            model: actualModel,
            chat_mode: 'normal',
            conversation_id: currentConversationId || null
          });
          
          // Update conversation updated_at timestamp
          if (currentConversationId) {
            await supabase
              .from('conversations')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', currentConversationId);
          }
          
          // Keep only last N messages per conversation (aligned with context limits)
          // Free: 10 messages, Premium: 20 messages per conversation
          // Keep a generous amount of stored history per conversation so the full
          // chat reloads when reopened. (LLM *context* is limited separately above
          // via contextMessageLimit — this cap is only to bound storage growth.)
          const maxHistory = 200;
          if (currentConversationId) {
            const { data: convHistory } = await supabase
              .from('conversation_history')
              .select('id')
              .eq('conversation_id', currentConversationId)
              .order('created_at', { ascending: false });

            if (convHistory && convHistory.length > maxHistory) {
              const idsToDelete = convHistory.slice(maxHistory).map((h: any) => h.id);
              await supabase
                .from('conversation_history')
                .delete()
                .in('id', idsToDelete);
            }
          }
      } catch (convError) {
        // Log but don't fail the request if conversation history save fails
        console.error('Failed to save conversation history:', convError);
      }
    }

    // Record free-tier usage server-side (lifetime counters).
    if (req.userId && !isPremium) {
      void recordFreeSearchUsage(req.userId, searchType === 'deep');
    }

    console.log(`📤 Sending back: conversationId=${currentConversationId}`);
    
    const resolvedSuggestions = Array.isArray((result as any).suggestedQuestions)
      ? (result as any).suggestedQuestions.filter((s: any) => typeof s === 'string' && s.trim().length > 0).slice(0, 3)
      : [];

    res.json({
      ...result,
      suggestedQuestions:
        resolvedSuggestions.length >= 3
          ? resolvedSuggestions
          : buildFallbackSuggestedQuestions(trimmedQuery),
      conversationId: currentConversationId
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── SSE Streaming search endpoint (/api/stream) ─────────────────────────────
router.post('/stream', optionalAuth, uploadSearchFiles, async (req: AuthRequest, res) => {
  // ── Parse & validate body (same as /search) ───────────────────────────────
  let bodyData = req.body;
  if (bodyData.newConversation === 'true' || bodyData.newConversation === 'false') {
    bodyData.newConversation = bodyData.newConversation === 'true';
  }
  if (typeof bodyData.conversationHistory === 'string') {
    try { bodyData.conversationHistory = JSON.parse(bodyData.conversationHistory); }
    catch { bodyData.conversationHistory = []; }
  }
  if (typeof bodyData.userContext === 'string') {
    try { bodyData.userContext = JSON.parse(bodyData.userContext); }
    catch { bodyData.userContext = undefined; }
  }

  if (Array.isArray(bodyData?.conversationHistory)) {
    bodyData.conversationHistory = bodyData.conversationHistory
      .filter((m: any) => m && typeof m.content === 'string' && m.content.trim().length > 0
        && (m.role === 'user' || m.role === 'assistant'));
  }

  const parse = searchSchema.safeParse(bodyData);
  if (!parse.success) {
    console.warn('stream: invalid request', JSON.stringify(parse.error.flatten().fieldErrors));
    return res.status(400).json({ error: 'Invalid request', details: parse.error.flatten().fieldErrors });
  }

  const { query, mode, model, newConversation, conversationId, conversationHistory: clientConversationHistory, userContext, searchType } = parse.data;
  const uploadedFilesEarly = collectUploadedFiles(req);
  const trimmedQuery = resolveQueryWithAttachments(query, uploadedFilesEarly.length);
  const effectiveUserContext = buildUserLocalContext(req, userContext);

  if (!trimmedQuery) return res.status(400).json({ error: 'Query cannot be empty' });

  // ── Premium check (BEFORE SSE headers so we can return a clean 403) ─────────
  let isPremium = false;
  let premiumTier = 'free';
  if (req.userId) {
    try {
      const access = await getSubscriptionAccessForUser(req.userId);
      isPremium = access.isPremium;
      premiumTier = access.premiumTier;
    } catch { /* default free */ }
  }

  // ── Server-side free-tier enforcement (logged-in users) ─────────────────────
  // Anonymous users can't be tracked server-side; they keep the client-side gate.
  if (req.userId && !isPremium) {
    const block = await checkFreeSearchAllowed(req.userId, searchType === 'deep');
    if (block) {
      return res.status(403).json({ error: block.message, limitReached: true, kind: block.kind });
    }
  }

  // ── SSE headers ────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const send = (event: string, data: object) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // ── Conversation management ────────────────────────────────────────────────
  let currentConversationId = conversationId;
  let createdNewConversation = false;
  if (req.userId && !currentConversationId) {
    try {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ user_id: req.userId, title: trimmedQuery.substring(0, 50), chat_mode: 'normal' })
        .select().single();
      if (newConv) { currentConversationId = (newConv as any).id; createdNewConversation = true; }
    } catch { /* continue */ }
  }

  // Auto-prune old conversations beyond the user's plan limit (non-blocking).
  if (req.userId && createdNewConversation) {
    void enforceConversationLimit(req.userId, isPremium ? premiumTier : 'free');
  }

  const actualModel = resolveActualSearchModel(model as LLMModel, isPremium);

  // ── Conversation history (compressed: verbatim window + rolling summary) ──
  const contextMessageLimit = !req.userId
    ? 5
    : premiumTier === 'max' ? 15
    : premiumTier === 'pro' ? 10
    : 5;
  let conversationHistory: any[] = [];
  let priorSummary: string | null = null;
  if (req.userId && currentConversationId && !newConversation) {
    try {
      const compressed = await buildCompressedContext(req.userId, currentConversationId, contextMessageLimit);
      conversationHistory = compressed.recent;
      priorSummary = compressed.summary;
    } catch { /* continue */ }
  }
  if ((!conversationHistory || conversationHistory.length === 0) && clientConversationHistory.length > 0) {
    conversationHistory = clientConversationHistory.slice(-contextMessageLimit);
  }

  // ── File attachments ───────────────────────────────────────────────────────
  let imageDataUrl: string | undefined;
  let attachments: import('../types.js').FileAttachment[] | undefined;
  const uploadedFiles = collectUploadedFiles(req);
  if (uploadedFiles.length > 0) {
    try {
      if (req.userId) {
        const processed = await processUploadedFiles(uploadedFiles, req.userId, 'search-attachments');
        attachments = enforceAttachmentLimit(processed, actualModel, isPremium);
      } else {
        attachments = enforceAttachmentLimit(
          uploadedFiles.map((f) => ({ dataUrl: fileToDataUrl(f), mimeType: f.mimetype, filename: f.originalname })),
          actualModel, isPremium
        );
      }
      const firstImage = attachments?.find((a) => a.mimeType.startsWith('image/'));
      if (firstImage) imageDataUrl = firstImage.dataUrl;
    } catch (e) { console.error('File processing error:', e); }
  }

  // Send conversationId before streaming starts
  send('meta', { conversationId: currentConversationId });

  // ── Stream ─────────────────────────────────────────────────────────────────
  let fullCleanText = '';
  let suggestedQuestions: string[] = [];

  try {
    for await (const event of streamAIAnswer(
      trimmedQuery, mode as import('../types.js').Mode, actualModel, isPremium, conversationHistory,
      'normal', null, null, null, null, null,
      imageDataUrl, effectiveUserContext, searchType as any, attachments, priorSummary
    )) {
      if (event.type === 'sources') {
        send('sources', { sources: event.sources });
      } else if (event.type === 'token') {
        send('token', { text: event.text });
      } else if (event.type === 'done') {
        fullCleanText = event.cleanText;
        suggestedQuestions = event.suggestedQuestions;
        const finalSuggestions = suggestedQuestions.length >= 3
          ? suggestedQuestions
          : buildFallbackSuggestedQuestions(trimmedQuery);
        send('done', { suggestedQuestions: finalSuggestions, cleanText: fullCleanText });
      }
      if (res.writableEnded) break;
    }
  } catch (error: any) {
    console.error('Stream error:', error);
    send('error', { message: error.message || 'Streaming failed' });
  } finally {
    if (!res.writableEnded) res.end();
  }

  // ── Persist to DB (non-blocking, after response ends) ─────────────────────
  if (req.userId && fullCleanText) {
    (async () => {
      try {
        await supabase.from('search_history').insert({
          user_id: req.userId!, query: trimmedQuery, mode, timestamp: new Date().toISOString()
        });
        await supabase.from('conversation_history').insert({
          user_id: req.userId!, query: trimmedQuery, answer: fullCleanText,
          mode, model: actualModel, chat_mode: 'normal',
          conversation_id: currentConversationId || null
        });
        if (currentConversationId) {
          await supabase.from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', currentConversationId);
        }
        // Record free-tier usage server-side (lifetime counters).
        if (!isPremium) await recordFreeSearchUsage(req.userId!, searchType === 'deep');
      } catch { /* don't fail after stream is done */ }
    })();
  }
});

// Get search suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

    if (query.length > 100) {
      return res.status(400).json({ error: 'Query too long' });
    }

    // Generate suggestions based on query
    const suggestions = [
      `${query} benefits`,
      `${query} challenges`,
      `${query} future trends`,
      `${query} best practices`,
      `${query} comparison`
    ].slice(0, 5);

    res.json(suggestions);
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get related queries
router.get('/related', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

    if (query.length > 100) {
      return res.status(400).json({ error: 'Query too long' });
    }

    const lowerQuery = query.toLowerCase();
    const related = [
      `What are the alternatives to ${lowerQuery}`,
      `How does ${lowerQuery} work`,
      `Why is ${lowerQuery} important`,
      `When to use ${lowerQuery}`,
      `Best practices for ${lowerQuery}`,
      `Common issues with ${lowerQuery}`
    ].slice(0, 6);

    res.json(related);
  } catch (error) {
    console.error('Related queries error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user search history
router.get('/search/history', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { data, error } = await supabase
      .from('search_history')
      .select('id, query, mode, timestamp, created_at')
      .eq('user_id', req.userId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Search history error:', error);
      return res.status(500).json({ error: 'Failed to fetch search history' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Search history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete search history
router.delete('/search/history', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.query;
    
    if (id) {
      // Delete specific item
      const { error } = await supabase
        .from('search_history')
        .delete()
        .eq('id', id)
        .eq('user_id', req.userId);

      if (error) {
        return res.status(500).json({ error: 'Failed to delete search history item' });
      }
    } else {
      // Delete all user's search history
      const { error } = await supabase
        .from('search_history')
        .delete()
        .eq('user_id', req.userId);

      if (error) {
        return res.status(500).json({ error: 'Failed to clear search history' });
      }
    }

    res.json({ message: 'Search history deleted successfully' });
  } catch (error) {
    console.error('Delete search history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
