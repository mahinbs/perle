import { Router } from 'express';
import { z } from 'zod';
import { generateAIAnswer } from '../utils/aiProviders.js';
import type { LLMModel, ConversationMessage, ChatMode, FileAttachment } from '../types.js';
import { supabase } from '../lib/supabase.js';
import { optionalAuth, type AuthRequest } from '../middleware/auth.js';
import { buildUserLocalContext } from '../utils/requestLocalContext.js';
import { extractMemoryFromUserMessage, formatAIFriendMemoryContext, mergeAIFriendMemory, type AIFriendMemory } from '../utils/aiFriendMemory.js';
import { uploadSearchFiles } from '../utils/uploadConfig.js';
import { LLM_MODEL_ENUM } from '../utils/modelRegistry.js';
import {
  collectUploadedFiles,
  processUploadedFiles,
  enforceAttachmentLimit,
  fileToDataUrl,
  resolveQueryWithAttachments,
} from '../utils/fileAttachments.js';

const router = Router();

const buildFallbackSuggestedQuestions = (message: string, chatMode: ChatMode): string[] => {
  if (chatMode === 'ai_psychologist') {
    return [
      "When does this feeling become strongest for you?",
      "What has helped you even a little in similar moments before?",
      "Would you like a small 5-minute step you can try right now?"
    ];
  }

  const q = message.trim();
  const lower = q.toLowerCase();
  const isGreeting =
    /^(hi|hello|hey|yo|sup|what'?s up|how are you|how r u|good (morning|afternoon|evening))[\s!?.,]*$/.test(lower) ||
    /(how are you|how r u)/.test(lower);
  const asksCurrentInfo =
    /(latest|current|today|now|this week|this month|2026|price|cost|launch|release|news)/.test(lower);

  if (isGreeting) {
    return [
      "What should we work on right now?",
      "Do you want a quick update on a topic you care about?",
      "Should I help with planning, research, or decision-making next?"
    ];
  }

  if (!q) {
    return [
      "Can you explain this in simpler terms?",
      "What should I do next?",
      "Can you give me one practical example?"
    ];
  }

  if (asksCurrentInfo) {
    return [
      `Do you want the latest update on "${q}" with fresh sources?`,
      `Should I compare top options and key differences for "${q}"?`,
      `Want prices, timeline, and availability for "${q}" in your region?`
    ];
  }

  return [
    `Do you want a concise summary of "${q}" first?`,
    `Should I explain "${q}" in deeper detail with examples?`,
    `Want a practical checklist or next steps for "${q}"?`
  ];
};

const stripInlineCitations = (text: string): string =>
  String(text || '')
    .replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const COMPANION_RECENT_MESSAGE_LIMIT = 10; // last 10 messages for model context
const COMPANION_CONTEXT_FETCH_EXCHANGES = 60; // enough history to summarize older context
const HISTORY_PAGE_DEFAULT = 20; // exchanges per page (each = user + assistant bubble)
const HISTORY_PAGE_MAX = 100;

const truncate = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

function buildCompanionContextSummary(olderMessages: ConversationMessage[]): string | null {
  if (!olderMessages || olderMessages.length === 0) return null;
  const userNotes = olderMessages
    .filter((m) => m.role === 'user')
    .slice(-8)
    .map((m) => `- User: ${truncate(m.content.replace(/\s+/g, ' ').trim(), 180)}`);
  const assistantNotes = olderMessages
    .filter((m) => m.role === 'assistant')
    .slice(-6)
    .map((m) => `- Assistant: ${truncate(stripInlineCitations(m.content).replace(/\s+/g, ' ').trim(), 180)}`);

  const lines = [...userNotes, ...assistantNotes].slice(-12);
  if (lines.length === 0) return null;
  return `Companion memory summary:\n${lines.join('\n')}`;
}

const chatSchema = z.object({
  message: z.string().max(2000, 'Message too long').default(''),
  model: z.enum(LLM_MODEL_ENUM).optional().default('gemini-lite'),
  newConversation: z.boolean().optional().default(false),
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
  searchType: z.enum(['auto', 'instant', 'deep']).optional(),
  chatMode: z.enum(['normal', 'ai_friend', 'ai_psychologist', 'space']).optional().default('normal'),
  aiFriendId: z.string().uuid().optional(), // Optional AI friend ID for individual chat
  mentionedFriendIds: z.array(z.string().uuid()).optional(), // Array of friend IDs for group chat (@ mentions)
  spaceId: z.string().uuid().optional() // Optional space ID for space-specific conversations
});

// Chat endpoint for AI Friend (supports both JSON and multipart/form-data with image)
router.post('/chat', optionalAuth, uploadSearchFiles, async (req: AuthRequest, res) => {
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

    const parse = chatSchema.safeParse(bodyData);
    if (!parse.success) {
      console.warn('chat: invalid request', JSON.stringify(parse.error.flatten().fieldErrors));
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { message, model, newConversation, conversationHistory: clientConversationHistory, userContext, searchType, chatMode, aiFriendId, mentionedFriendIds, spaceId } = parse.data;
    const uploadedFilesEarly = collectUploadedFiles(req);
    const trimmedMessage = resolveQueryWithAttachments(message, uploadedFilesEarly.length);
    const effectiveUserContext = buildUserLocalContext(req, userContext);

    if (!trimmedMessage) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Fetch AI friend details if aiFriendId is provided (only for ai_friend mode)
    let aiFriendDescription: string | null = null;
    let aiFriendName: string | null = null;
    let aiFriendMemory: AIFriendMemory | null = null;
    let aiFriendMemoryContext: string | null = null;
    if (chatMode === 'ai_friend' && aiFriendId && req.userId) {
      try {
        const { data: friend } = await supabase
          .from('ai_friends')
          .select('name, description')
          .eq('id', aiFriendId)
          .eq('user_id', req.userId)
          .single();

        if (friend) {
          aiFriendDescription = friend.description;
          aiFriendName = friend.name;
        }

        // Load memory for this user+friend pair (best effort)
        const { data: memoryRow } = await supabase
          .from('ai_friend_user_memory')
          .select('preferred_name, pronouns, key_nouns')
          .eq('user_id', req.userId)
          .eq('ai_friend_id', aiFriendId)
          .maybeSingle();

        if (memoryRow) {
          aiFriendMemory = {
            preferredName: (memoryRow as any).preferred_name || null,
            pronouns: (memoryRow as any).pronouns || null,
            keyNouns: Array.isArray((memoryRow as any).key_nouns) ? (memoryRow as any).key_nouns : []
          };
          aiFriendMemoryContext = formatAIFriendMemoryContext(aiFriendMemory);
        }
      } catch (friendError) {
        console.warn('Failed to fetch AI friend:', friendError);
        // Continue without friend description if fetch fails
      }
    }

    // Fetch space details if spaceId is provided
    let spaceTitle: string | null = null;
    let spaceDescription: string | null = null;
    if (spaceId && req.userId) {
      try {
        // First try to get as owner
        const { data: ownSpace } = await supabase
          .from('spaces')
          .select('title, description')
          .eq('id', spaceId)
          .eq('user_id', req.userId)
          .single();

        if (ownSpace) {
          spaceTitle = ownSpace.title;
          spaceDescription = ownSpace.description;
        } else {
          // If not owner, check if it's public
          const { data: publicSpace } = await supabase
            .from('spaces')
            .select('title, description')
            .eq('id', spaceId)
            .eq('is_public', true)
            .single();

          if (publicSpace) {
            spaceTitle = publicSpace.title;
            spaceDescription = publicSpace.description;
          }
        }
      } catch (spaceError) {
        console.warn('Failed to fetch space:', spaceError);
        // Continue without space context if fetch fails
      }
    }

    // Check premium status
    let isPremium = false;
    let premiumTier = 'free';
    if (req.userId) {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('is_premium, premium_tier, subscription_status, subscription_end_date')
          .eq('user_id', req.userId)
          .single();

        if (profile) {
          // Check if premium and subscription is active
          const hasActiveSubscription = profile.subscription_status === 'active' &&
            profile.subscription_end_date &&
            new Date(profile.subscription_end_date) > new Date();

          isPremium = (profile.is_premium === true || profile.premium_tier === 'pro' || profile.premium_tier === 'max') && hasActiveSubscription;
          if (hasActiveSubscription) premiumTier = profile.premium_tier || 'free';
        }
      } catch (e) {
        console.warn('Failed to fetch premium status, defaulting to free:', e);
      }
    }

    // Determine actual model to use (works for ALL chat modes: normal, ai_friend, ai_psychologist)
    let actualModel: LLMModel = model as LLMModel;
    
    if (!isPremium) {
      // Free users always use gemini-lite regardless of chat mode
      actualModel = 'gemini-lite';
      console.log(`🔒 Free user - forcing gemini-lite for ${chatMode} mode`);
    } else {
      // Premium users can use ANY model in ANY chat mode
      if (model === 'auto') {
        actualModel = 'gemini-lite';
      } else {
        actualModel = model as LLMModel;
      }
      console.log(`✅ Premium user - using ${actualModel} for ${chatMode} mode`);
    }

    // Fetch conversation history for context - ISOLATED BY CHAT MODE, SPACE, AND AI FRIEND
    // Non-logged: 5 messages (from client fallback only)
    // Verbatim window: Free 5 / Pro 10 / Max 15. Summary-of-older path lives in
    // /search; chat threads here keep just the tighter window for now (chat
    // history isn't always keyed to a single conversations.id, so summary
    // compression would need its own scoping pass — kept as a follow-up).
    const contextMessageLimit = !req.userId
      ? 5
      : premiumTier === 'max' ? 15
      : premiumTier === 'pro' ? 10
      : 5;
    // Context is isolated per user, chat mode, space, AND ai_friend_id (no mixing between friends)
    const isCompanionMode = chatMode === 'ai_friend' || chatMode === 'ai_psychologist';
    let conversationHistory: ConversationMessage[] = [];
    let priorSummary: string | undefined = undefined;
    if (req.userId && !newConversation) {
      try {
        let query = supabase
          .from('conversation_history')
          .select('query, answer')
          .eq('user_id', req.userId)
          .eq('chat_mode', chatMode); // Filter by chat mode - ensures separate histories
        
        // If spaceId is provided, filter by space. Otherwise, only get non-space conversations
        if (spaceId) {
          query = query.eq('space_id', spaceId);
        } else {
          query = query.is('space_id', null);
        }
        
        // If aiFriendId is provided (individual chat), filter by friend. Otherwise, get group chats (null ai_friend_id)
        if (chatMode === 'ai_friend' && aiFriendId) {
          query = query.eq('ai_friend_id', aiFriendId);
        } else if (chatMode === 'ai_friend') {
          // Group chat: get conversations with null ai_friend_id
          query = query.is('ai_friend_id', null);
        } else {
          // Non-ai_friend modes: ensure ai_friend_id is null
          query = query.is('ai_friend_id', null);
        }
        
        const historyLimit = isCompanionMode ? COMPANION_CONTEXT_FETCH_EXCHANGES : contextMessageLimit;
        const { data: history } = await query
          .order('created_at', { ascending: false })
          .limit(historyLimit);
        
        if (history && history.length > 0) {
          // Convert to conversation format (reverse to get chronological order)
          const fullHistory = history.reverse().flatMap((item: any) => [
            { role: 'user' as const, content: item.query },
            { role: 'assistant' as const, content: item.answer }
          ]);
          if (isCompanionMode) {
            const splitIndex = Math.max(0, fullHistory.length - COMPANION_RECENT_MESSAGE_LIMIT);
            const older = fullHistory.slice(0, splitIndex);
            const recent = fullHistory.slice(splitIndex);
            priorSummary = buildCompanionContextSummary(older) || undefined;
            conversationHistory = recent;
          } else {
            conversationHistory = fullHistory;
          }
        }
      } catch (historyError) {
        console.warn('Failed to fetch conversation history:', historyError);
        // Continue without history if fetch fails
      }
    }

    // Fallback context: if server-side history isn't available, use client-provided history
    if ((!conversationHistory || conversationHistory.length === 0) && clientConversationHistory.length > 0) {
      if (isCompanionMode) {
        const splitIndex = Math.max(0, clientConversationHistory.length - COMPANION_RECENT_MESSAGE_LIMIT);
        const older = clientConversationHistory.slice(0, splitIndex);
        const recent = clientConversationHistory.slice(splitIndex);
        priorSummary = buildCompanionContextSummary(older) || undefined;
        conversationHistory = recent;
      } else {
        conversationHistory = clientConversationHistory.slice(-contextMessageLimit);
      }
    }
    
    // If starting new conversation, clear existing history for this user, chat mode, space, and ai friend
    // Only clears the specific chat mode's, space's, and friend's history, not all histories
    if (req.userId && newConversation) {
      try {
        let deleteQuery = supabase
          .from('conversation_history')
          .delete()
          .eq('user_id', req.userId)
          .eq('chat_mode', chatMode); // Only clear this specific chat mode's history
        
        // If spaceId is provided, clear only that space's history. Otherwise, clear non-space conversations
        if (spaceId) {
          deleteQuery = deleteQuery.eq('space_id', spaceId);
        } else {
          deleteQuery = deleteQuery.is('space_id', null);
        }
        
        // If aiFriendId is provided (individual chat), clear only that friend's history. Otherwise, clear group chats
        if (chatMode === 'ai_friend' && aiFriendId) {
          deleteQuery = deleteQuery.eq('ai_friend_id', aiFriendId);
        } else if (chatMode === 'ai_friend') {
          deleteQuery = deleteQuery.is('ai_friend_id', null);
        } else {
          deleteQuery = deleteQuery.is('ai_friend_id', null);
        }
        
        await deleteQuery;
      } catch (clearError) {
        console.warn('Failed to clear conversation history:', clearError);
        // Continue even if clear fails
      }
    }

    // Process uploaded files (images + documents)
    let imageDataUrl: string | undefined = undefined;
    let attachments: FileAttachment[] | undefined;
    const uploadedFiles = collectUploadedFiles(req);
    if (uploadedFiles.length > 0 && req.userId) {
      try {
        console.log(`📎 ${uploadedFiles.length} file(s) attached in chat`);
        const processed = await processUploadedFiles(uploadedFiles, req.userId, 'chat-attachments');
        attachments = enforceAttachmentLimit(processed, actualModel, isPremium);
        if (attachments.length > 1) {
          console.log(`📎 Multi-file chat analysis (${attachments.length}): ${attachments.map((a) => a.filename).join(', ')}`);
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
      if (attachments.length > 1) {
        console.log(`📎 Multi-file chat analysis (${attachments.length}): ${attachments.map((a) => a.filename).join(', ')}`);
      }
      const firstImage = attachments.find((a) => a.mimeType.startsWith('image/'));
      if (firstImage) imageDataUrl = firstImage.dataUrl;
    }

    // Generate answer using AI provider with chat mode
    let result;
    try {
      result = await generateAIAnswer(
        trimmedMessage, 
        'Ask', 
        actualModel, 
        isPremium, 
        conversationHistory, 
        chatMode, 
        aiFriendDescription, 
        aiFriendName, 
        aiFriendMemoryContext,
        spaceTitle, 
        spaceDescription,
        imageDataUrl,
        effectiveUserContext,
        searchType as any,
        attachments,
        priorSummary
      );
    } catch (apiError: any) {
      console.error('AI provider error:', apiError);
      const errorMessage = apiError?.message || 'Failed to generate answer';
      return res.status(500).json({ 
        error: errorMessage,
        details: apiError?.message?.includes('API_KEY') 
          ? 'API key is missing or invalid. Please check your API keys in .env file.'
          : undefined
      });
    }

    // Save to conversation history for context (store answer text with chat mode)
    // Both free and premium users save history (different limits)
    // History is isolated by chat mode
    if (req.userId) {
      try {
        const rawAnswerText = result.chunks.map(c => c.text).join('\n\n');
        const answerText = (chatMode === 'ai_friend' || chatMode === 'ai_psychologist')
          ? stripInlineCitations(rawAnswerText)
          : rawAnswerText;
        let insertData: any = {
          user_id: req.userId,
          query: trimmedMessage,
          answer: answerText,
          mode: 'Ask',
          model: actualModel,
          chat_mode: chatMode, // Save with chat mode for isolation
          space_id: spaceId || null, // Save with space ID for isolation
          ai_friend_id: (chatMode === 'ai_friend' && aiFriendId) ? aiFriendId : null // Save with ai friend ID for isolation
        };
        
        console.log(`💾 Saving to history: mode=${chatMode}, aiFriendId=${aiFriendId || 'none'}, spaceId=${spaceId || 'none'}`);
        
        const { error: insertError } = await supabase
          .from('conversation_history')
          .insert(insertData);
        
        if (insertError) {
          console.error('❌ Failed to save to history:', insertError);
        } else {
          console.log('✅ History saved successfully');
        }
        
        // Keep only last N messages per user per chat mode per friend/space (cleanup old ones)
        // Free: 10 messages, Premium: 20 messages
        const maxHistory = isPremium ? 20 : 10;
        let cleanupQuery = supabase
          .from('conversation_history')
          .select('id')
          .eq('user_id', req.userId)
          .eq('chat_mode', chatMode); // Filter by chat mode
        
        // If spaceId is provided, filter by space. Otherwise, only get non-space conversations
        if (spaceId) {
          cleanupQuery = cleanupQuery.eq('space_id', spaceId);
        } else {
          cleanupQuery = cleanupQuery.is('space_id', null);
        }
        
        // If aiFriendId is provided (individual chat), filter by friend. Otherwise, get group chats
        if (chatMode === 'ai_friend' && aiFriendId) {
          cleanupQuery = cleanupQuery.eq('ai_friend_id', aiFriendId);
        } else if (chatMode === 'ai_friend') {
          cleanupQuery = cleanupQuery.is('ai_friend_id', null);
        } else {
          cleanupQuery = cleanupQuery.is('ai_friend_id', null);
        }
        
        const { data: allHistory } = await cleanupQuery
          .order('created_at', { ascending: false });
        
        if (allHistory && allHistory.length > maxHistory) {
          const idsToDelete = allHistory.slice(maxHistory).map((h: any) => h.id);
          await supabase
            .from('conversation_history')
            .delete()
            .in('id', idsToDelete);
        }

        // Update user memory for this specific AI friend (best effort)
        if (chatMode === 'ai_friend' && aiFriendId) {
          try {
            const extracted = extractMemoryFromUserMessage(trimmedMessage);
            if (extracted.preferredName || extracted.pronouns || extracted.nouns.length > 0) {
              const merged = mergeAIFriendMemory(aiFriendMemory, extracted);
              await supabase
                .from('ai_friend_user_memory')
                .upsert(
                  {
                    user_id: req.userId,
                    ai_friend_id: aiFriendId,
                    preferred_name: merged.preferredName,
                    pronouns: merged.pronouns,
                    key_nouns: merged.keyNouns
                  },
                  { onConflict: 'user_id,ai_friend_id' }
                );
            }
          } catch (memoryError) {
            console.warn('Failed to update AI friend memory:', memoryError);
          }
        }
      } catch (convError) {
        // Log but don't fail the request if conversation history save fails
        console.error('Failed to save conversation history:', convError);
      }
    }

    // Return answer text with optional images
    const rawAnswerText = result.chunks.map(c => c.text).join('\n\n');
    const answerText = (chatMode === 'ai_friend' || chatMode === 'ai_psychologist')
      ? stripInlineCitations(rawAnswerText)
      : rawAnswerText;
    const resolvedSuggestions = Array.isArray((result as any).suggestedQuestions)
      ? (result as any).suggestedQuestions.filter((s: any) => typeof s === 'string' && s.trim().length > 0).slice(0, 3)
      : [];

    const shouldDisableSuggestions = chatMode === 'ai_friend';

    res.json({ 
      message: answerText,
      model: actualModel,
      images: result.images || [], // Include generated images if any
      sources: (chatMode === 'ai_psychologist' || chatMode === 'ai_friend') ? [] : (result.sources || []),
      suggestedQuestions: shouldDisableSuggestions
        ? []
        : (
          resolvedSuggestions.length >= 3
            ? resolvedSuggestions
            : buildFallbackSuggestedQuestions(trimmedMessage, chatMode)
        )
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get chat history (filtered by chat mode)
router.get('/chat/history', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.json({ messages: [] });
    }

    // Get chatMode from query parameter (default to 'normal')
    const chatMode = (req.query.chatMode as ChatMode) || 'normal';
    
    console.log(`📚 Loading chat history for user ${req.userId}, mode: ${chatMode}`);

    const isCompanionMode = chatMode === 'ai_friend' || chatMode === 'ai_psychologist';
    // Perplexity-style pagination: load a small page fast, fetch older on scroll.
    // `limit` = number of exchanges (query+answer pairs), not individual bubbles.
    const parsedLimit = Number.parseInt(String(req.query.limit ?? ''), 10);
    const messageLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, HISTORY_PAGE_MAX)
      : HISTORY_PAGE_DEFAULT;
    const beforeIso = typeof req.query.before === 'string' ? req.query.before : undefined;

    // Get spaceId and aiFriendId from query parameters if provided
    const spaceId = req.query.spaceId as string | undefined;
    const aiFriendId = req.query.aiFriendId as string | undefined;
    
    let historyQuery = supabase
      .from('conversation_history')
      .select('query, answer, created_at')
      .eq('user_id', req.userId) // Isolated per user
      .eq('chat_mode', chatMode); // Isolated per chat mode - ensures separate histories
    
    // If spaceId is provided, filter by space. Otherwise, only get non-space conversations
    if (spaceId) {
      historyQuery = historyQuery.eq('space_id', spaceId);
    } else {
      historyQuery = historyQuery.is('space_id', null);
    }
    
    // If aiFriendId is provided (individual chat), filter by friend. Otherwise, get group chats (null ai_friend_id)
    if (chatMode === 'ai_friend' && aiFriendId) {
      historyQuery = historyQuery.eq('ai_friend_id', aiFriendId);
    } else if (chatMode === 'ai_friend') {
      // Group chat: get conversations with null ai_friend_id
      historyQuery = historyQuery.is('ai_friend_id', null);
    } else {
      // Non-ai_friend modes: ensure ai_friend_id is null
      historyQuery = historyQuery.is('ai_friend_id', null);
    }
    
    if (beforeIso) {
      historyQuery = historyQuery.lt('created_at', beforeIso);
    }

    // Order descending so we always take the newest N up to `before` (when
    // paginating older pages). We re-sort to ascending before returning so
    // the UI gets oldest → newest naturally.
    const { data: rawHistory } = await historyQuery
      .order('created_at', { ascending: false })
      .limit(messageLimit);
    const history = (rawHistory || []).slice().reverse();

    console.log(`📚 Found ${history?.length || 0} history items for mode ${chatMode}, aiFriendId: ${aiFriendId || 'none'}`);

    if (!history || history.length === 0) {
      console.log(`📚 No history found, returning empty array`);
      return res.json({ messages: [], hasMore: false, oldestTimestamp: null, summary: null, pageSize: messageLimit });
    }

    // Convert to chat message format
    const sanitizeForMode = (text: string) =>
      (chatMode === 'ai_friend' || chatMode === 'ai_psychologist')
        ? stripInlineCitations(text)
        : text;
    const messages = history.flatMap((item: any) => [
      { role: 'user' as const, content: item.query, timestamp: item.created_at },
      { role: 'assistant' as const, content: sanitizeForMode(item.answer), timestamp: item.created_at }
    ]);

    const historySummary = isCompanionMode
      ? buildCompanionContextSummary(
          messages
            .slice(0, Math.max(0, messages.length - COMPANION_RECENT_MESSAGE_LIMIT))
            .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content || '') }))
        )
      : null;

    // Pagination cursor: pass this as `before` to fetch the next older page.
    const oldestIso = history[0]?.created_at || null;
    const hasMore = history.length === messageLimit;

    console.log(`📚 Returning ${messages.length} messages (hasMore=${hasMore}, pageSize=${messageLimit})`);
    res.json({ messages, summary: historySummary, hasMore, oldestTimestamp: oldestIso, pageSize: messageLimit });
  } catch (error) {
    console.error('Chat history error:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

export default router;

