import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { generateAIAnswer } from '../utils/aiProviders.js';
import type { LLMModel, ConversationMessage, ChatMode } from '../types.js';
import { supabase } from '../lib/supabase.js';
import { optionalAuth, type AuthRequest } from '../middleware/auth.js';
import { buildUserLocalContext } from '../utils/requestLocalContext.js';
import { extractMemoryFromUserMessage, formatAIFriendMemoryContext, mergeAIFriendMemory, type AIFriendMemory } from '../utils/aiFriendMemory.js';

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
  if (!q) {
    return [
      "Can you explain this in simpler terms?",
      "What should I do next?",
      "Can you give me one practical example?"
    ];
  }

  return [
    `Can you explain "${q}" in simpler terms?`,
    `What should I do next about "${q}"?`,
    `Can you give one practical example for "${q}"?`
  ];
};

// Configure multer for file uploads (images and documents)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common document types
    const allowedTypes = [
      'image/', // All image types
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // .xlsx
    ];
    
    if (allowedTypes.some(type => file.mimetype.startsWith(type) || file.mimetype === type)) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported. Allowed: images, PDF, Word, Excel, text files'));
    }
  },
});

const chatSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message too long'),
  model: z.enum([
    'auto',
    'gpt-5',
    'gpt-5.1',
    'gpt-5.2',
    'gpt-5.3',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'gemini-2.0-latest',
    'gemini-3.0',
    'gemini-3.1',
    'gemini-3.1-flash',
    'gemini-lite',
    'claude-4.5-sonnet',
    'claude-4.5-opus',
    'claude-4.6-sonnet',
    'claude-4.6-opus',
    'claude-4.5-haiku',
    'claude-4-sonnet',
    'claude-3.5-sonnet',
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
    'grok-3',
    'grok-3-mini',
    // 'grok-4', // COMMENTED OUT
    'grok-4-heavy',
    'grok-4-fast',
    'grok-code-fast-1',
    'grok-beta',
    'gemini-pro',
    'gemini-pro-vision',
    'llama-2',
    'mistral-7b'
  ]).optional().default('gemini-lite'),
  newConversation: z.boolean().optional().default(false),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(6000),
      })
    )
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
router.post('/chat', optionalAuth, upload.single('image'), async (req: AuthRequest, res) => {
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
    
    const parse = chatSchema.safeParse(bodyData);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { message, model, newConversation, conversationHistory: clientConversationHistory, userContext, searchType, chatMode, aiFriendId, mentionedFriendIds, spaceId } = parse.data;
    const trimmedMessage = message.trim();
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
    // Free logged: 10 messages
    // Premium logged: 20 messages
    const contextMessageLimit = req.userId ? (isPremium ? 20 : 10) : 5;
    // Context is isolated per user, chat mode, space, AND ai_friend_id (no mixing between friends)
    let conversationHistory: ConversationMessage[] = [];
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
        
        const { data: history } = await query
          .order('created_at', { ascending: false })
          .limit(contextMessageLimit);
        
        if (history && history.length > 0) {
          // Convert to conversation format (reverse to get chronological order)
          conversationHistory = history.reverse().flatMap((item: any) => [
            { role: 'user' as const, content: item.query },
            { role: 'assistant' as const, content: item.answer }
          ]);
        }
      } catch (historyError) {
        console.warn('Failed to fetch conversation history:', historyError);
        // Continue without history if fetch fails
      }
    }

    // Fallback context: if server-side history isn't available, use client-provided history
    if ((!conversationHistory || conversationHistory.length === 0) && clientConversationHistory.length > 0) {
      conversationHistory = clientConversationHistory.slice(-contextMessageLimit);
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

    // Process uploaded file (image/document) if present
    let imageDataUrl: string | undefined = undefined;
    if (req.file && req.userId) {
      try {
        const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'document';
        console.log(`📎 ${fileType} attached: ${req.file.mimetype}, ${(req.file.size / 1024).toFixed(2)}KB`);
        
        // Step 1: Upload to Supabase 'files' bucket (supports all MIME types)
        const fileExtension = req.file.originalname?.split('.').pop() || 'bin';
        const fileName = `chat-attachments/${req.userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
        
        const { error: uploadError } = await supabase.storage
          .from('files')
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
          });
        
        if (uploadError) {
          console.error('Failed to upload file to Supabase:', uploadError);
          // Fallback: use buffer directly
          const base64File = req.file.buffer.toString('base64');
          imageDataUrl = `data:${req.file.mimetype};base64,${base64File}`;
          console.log(`⚠️  Using direct buffer fallback for ${fileType}`);
        } else {
          // Step 2: Get public URL
          const { data: urlData } = supabase.storage
            .from('files')
            .getPublicUrl(fileName);
          
          console.log(`✅ ${fileType} uploaded to Supabase: ${fileName}`);
          
          // Step 3: Convert to base64 for AI (after successful upload)
          const base64File = req.file.buffer.toString('base64');
          imageDataUrl = `data:${req.file.mimetype};base64,${base64File}`;
          
          console.log(`✅ ${fileType} converted to base64 (${base64File.length} chars) for AI`);
        }
      } catch (fileError) {
        console.error('Failed to process file:', fileError);
        // Continue without file if processing fails
      }
    }

    // Generate answer using AI provider with chat mode
    let result;
    try {
      // Pass chat mode, AI friend description, space context, and optional image to AI provider
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
        imageDataUrl, // Pass image for vision models
        effectiveUserContext,
        searchType as any
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
        const answerText = result.chunks.map(c => c.text).join('\n\n');
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
    const answerText = result.chunks.map(c => c.text).join('\n\n');
    const resolvedSuggestions = Array.isArray((result as any).suggestedQuestions)
      ? (result as any).suggestedQuestions.filter((s: any) => typeof s === 'string' && s.trim().length > 0).slice(0, 3)
      : [];

    const shouldDisableSuggestions = chatMode === 'ai_friend';

    res.json({ 
      message: answerText,
      model: actualModel,
      images: result.images || [], // Include generated images if any
      sources: chatMode === 'ai_psychologist' ? [] : (result.sources || []), // No sources in psychology mode
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

    // Check premium status to determine limit
    let isPremium = false;
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('is_premium, premium_tier, subscription_status, subscription_end_date')
        .eq('user_id', req.userId)
        .single();

      if (profile) {
        const hasActiveSubscription = profile.subscription_status === 'active' && 
          profile.subscription_end_date && 
          new Date(profile.subscription_end_date) > new Date();
        
        isPremium = (profile.is_premium === true || profile.premium_tier === 'pro' || profile.premium_tier === 'max') && hasActiveSubscription;
      }
    } catch (e) {
      console.warn('Failed to fetch premium status for history:', e);
    }

    // Free: 10 messages, Premium: 20 messages
    // Context is isolated per user AND chat mode (no mixing between modes)
    const messageLimit = isPremium ? 20 : 10;

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
    
    const { data: history } = await historyQuery
      .order('created_at', { ascending: true })
      .limit(messageLimit);

    console.log(`📚 Found ${history?.length || 0} history items for mode ${chatMode}, aiFriendId: ${aiFriendId || 'none'}`);

    if (!history || history.length === 0) {
      console.log(`📚 No history found, returning empty array`);
      return res.json({ messages: [] });
    }

    // Convert to chat message format
    const messages = history.flatMap((item: any) => [
      { role: 'user' as const, content: item.query, timestamp: item.created_at },
      { role: 'assistant' as const, content: item.answer, timestamp: item.created_at }
    ]);

    console.log(`📚 Returning ${messages.length} messages`);
    res.json({ messages });
  } catch (error) {
    console.error('Chat history error:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

export default router;

