import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { generateAIAnswer } from '../utils/aiProviders.js';
import type { AnswerResult, Mode, LLMModel } from '../types.js';
import { supabase } from '../lib/supabase.js';
import { optionalAuth, type AuthRequest } from '../middleware/auth.js';

const router = Router();

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

const searchSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty').max(500, 'Query too long'),
  mode: z.enum(['Ask', 'Research', 'Summarize', 'Compare']).default('Ask'),
  newConversation: z.boolean().optional().default(false), // Flag to start new conversation
  conversationId: z.union([z.string().uuid(), z.null()]).optional(), // Optional conversation ID to continue existing conversation (can be null)
  model: z.enum([
    'auto',
    'gpt-5',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'gemini-2.0-latest',
    'gemini-lite',
    'grok-3',
    'grok-3-mini',
    // 'grok-4', // COMMENTED OUT - temporarily disabled
    'grok-4-heavy',
    'grok-4-fast',
    'grok-code-fast-1',
    'grok-beta',
    // 'claude-4.5',
    // 'claude-3-opus',
    // 'claude-3-sonnet',
    // 'claude-3-haiku',
    'gemini-pro',
    'gemini-pro-vision',
    'llama-2',
    'mistral-7b'
  ]).default('gemini-lite')
});

// Main search endpoint (supports file uploads)
router.post('/search', optionalAuth, upload.single('image'), async (req: AuthRequest, res) => {
  try {
    // Handle both JSON and form-data
    let bodyData = req.body;
    
    // Convert form-data string values to proper types
    if (bodyData.newConversation === 'true' || bodyData.newConversation === 'false') {
      bodyData.newConversation = bodyData.newConversation === 'true';
    }
    
    const parse = searchSchema.safeParse(bodyData);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { query, mode, model, newConversation, conversationId } = parse.data;
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return res.status(400).json({ error: 'Query cannot be empty' });
    }

    console.log(`📨 Received: conversationId=${conversationId}, newConversation=${newConversation}`);

    // Handle conversation management
    let currentConversationId = conversationId;
    
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
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('premium_tier, is_premium, subscription_status, subscription_end_date')
          .eq('user_id', req.userId)
          .single();
        
        if (profile) {
          premiumTier = (profile as any)?.premium_tier || 'free';
          // Check if subscription is active and not expired
          const status = (profile as any)?.subscription_status || 'inactive';
          const endDate = (profile as any)?.subscription_end_date;
          
          if (status === 'active' && endDate) {
            const expiryDate = new Date(endDate);
            const now = new Date();
            if (expiryDate < now) {
              // Subscription expired
              isPremium = false;
              premiumTier = 'free';
            } else {
              isPremium = premiumTier !== 'free';
            }
          } else {
            // Fallback to is_premium for backward compatibility
            isPremium = (profile as any)?.is_premium ?? (premiumTier !== 'free');
          }
        }
      } catch (e) {
        // If profile fetch fails, assume free user
        console.warn('Failed to fetch premium status, defaulting to free:', e);
      }
    }

    // Determine actual model to use
    let actualModel: LLMModel = model as LLMModel;
    
    if (!isPremium) {
      // Free users always use gemini-lite
      actualModel = 'gemini-lite';
    } else {
      // Premium users: if 'auto' is selected, use gemini-lite
      if (model === 'auto') {
        actualModel = 'gemini-lite';
      } else {
        actualModel = model as LLMModel;
      }
    }

    // Fetch conversation history for context
    // Both free and premium users get history (different limits)
    // Free: 5 messages, Premium: 20 messages
    let conversationHistory: any[] = [];
    if (req.userId && currentConversationId && !newConversation) {
      try {
        const messageLimit = isPremium ? 20 : 5;
        const { data: history } = await supabase
          .from('conversation_history')
          .select('query, answer')
          .eq('conversation_id', currentConversationId)
          .order('created_at', { ascending: false })
          .limit(messageLimit);
        
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
    
    // If starting new conversation, clear existing history for this user
    if (req.userId && newConversation) {
      try {
        await supabase
          .from('conversation_history')
          .delete()
          .eq('user_id', req.userId);
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
        console.log(`📎 ${fileType} attached in search: ${req.file.mimetype}, ${(req.file.size / 1024).toFixed(2)}KB`);
        
        // Step 1: Upload to Supabase 'files' bucket (supports all MIME types)
        const fileExtension = req.file.originalname?.split('.').pop() || 'bin';
        const fileName = `search-attachments/${req.userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
        
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

    // Generate answer using real AI provider only - no fallbacks
    let result: AnswerResult;
    try {
      result = await generateAIAnswer(trimmedQuery, mode as Mode, actualModel, isPremium, conversationHistory, 'normal', null, null, null, null, imageDataUrl);
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
          
          // Keep only last N messages per conversation (cleanup old ones)
          // Free: 10 messages, Premium: 50 messages per conversation
          const maxHistory = isPremium ? 50 : 10;
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

    console.log(`📤 Sending back: conversationId=${currentConversationId}`);
    
    res.json({
      ...result,
      conversationId: currentConversationId
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
