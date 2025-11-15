import { Router } from 'express';
import { z } from 'zod';
import { generateAIAnswer } from '../utils/aiProviders.js';
import type { LLMModel, ConversationMessage } from '../types.js';
import { supabase } from '../lib/supabase.js';
import { optionalAuth, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message too long'),
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
  newConversation: z.boolean().optional().default(false)
});

// Chat endpoint for AI Friend
router.post('/chat', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const parse = chatSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { message, model, newConversation } = parse.data;
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      return res.status(400).json({ error: 'Message cannot be empty' });
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
    // Free users: 5 messages, Premium users: 20 messages
    // Context is isolated per user (user_id ensures no mixing)
    let conversationHistory: ConversationMessage[] = [];
    if (req.userId && !newConversation) {
      try {
        const messageLimit = isPremium ? 20 : 5; // Premium: 20, Free: 5
        const { data: history } = await supabase
          .from('conversation_history')
          .select('query, answer')
          .eq('user_id', req.userId)
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

    // Generate answer using AI provider
    let result;
    try {
      // Use 'Ask' mode for chat
      result = await generateAIAnswer(trimmedMessage, 'Ask', actualModel, isPremium, conversationHistory);
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

    // Save to conversation history for context (store answer text)
    // Both free and premium users save history (different limits)
    if (req.userId) {
      try {
        const answerText = result.chunks.map(c => c.text).join('\n\n');
        await supabase
          .from('conversation_history')
          .insert({
            user_id: req.userId,
            query: trimmedMessage,
            answer: answerText,
            mode: 'Ask',
            model: actualModel
          });
        
        // Keep only last N messages per user (cleanup old ones)
        // Free: 5 messages, Premium: 20 messages
        const maxHistory = isPremium ? 20 : 5;
        const { data: allHistory } = await supabase
          .from('conversation_history')
          .select('id')
          .eq('user_id', req.userId)
          .order('created_at', { ascending: false });
        
        if (allHistory && allHistory.length > maxHistory) {
          const idsToDelete = allHistory.slice(maxHistory).map((h: any) => h.id);
          await supabase
            .from('conversation_history')
            .delete()
            .in('id', idsToDelete);
        }
      } catch (convError) {
        // Log but don't fail the request if conversation history save fails
        console.error('Failed to save conversation history:', convError);
      }
    }

    // Return just the answer text for chat
    const answerText = result.chunks.map(c => c.text).join('\n\n');
    res.json({ 
      message: answerText,
      model: actualModel
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get chat history
router.get('/chat/history', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.json({ messages: [] });
    }

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

    // Free: 5 messages, Premium: 20 messages
    // Context is isolated per user (user_id ensures no mixing between different users)
    const messageLimit = isPremium ? 20 : 5;

    const { data: history } = await supabase
      .from('conversation_history')
      .select('query, answer, created_at')
      .eq('user_id', req.userId) // Isolated per user - no mixing
      .order('created_at', { ascending: true })
      .limit(messageLimit);

    if (!history) {
      return res.json({ messages: [] });
    }

    // Convert to chat message format
    const messages = history.flatMap((item: any) => [
      { role: 'user' as const, content: item.query, timestamp: item.created_at },
      { role: 'assistant' as const, content: item.answer, timestamp: item.created_at }
    ]);

    res.json({ messages });
  } catch (error) {
    console.error('Chat history error:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

export default router;

