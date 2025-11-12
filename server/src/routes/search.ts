import { Router } from 'express';
import { z } from 'zod';
import { generateAIAnswer } from '../utils/aiProviders.js';
import type { AnswerResult, Mode, LLMModel } from '../types.js';
import { supabase } from '../lib/supabase.js';
import { optionalAuth, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const searchSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty').max(500, 'Query too long'),
  mode: z.enum(['Ask', 'Research', 'Summarize', 'Compare']).default('Ask'),
  model: z.enum([
    'auto',
    'gpt-5',
    'gemini-2.0-latest',
    'grok-4',
    'claude-4.5',
    'gemini-lite',
    'gpt-4',
    'gpt-3.5-turbo',
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
    'gemini-pro',
    'gemini-pro-vision',
    'llama-2',
    'mistral-7b'
  ]).default('gemini-lite')
});

// Main search endpoint
router.post('/search', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const parse = searchSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { query, mode, model } = parse.data;
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return res.status(400).json({ error: 'Query cannot be empty' });
    }

    // Check if user is premium
    let isPremium = false;
    if (req.userId) {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('is_premium')
          .eq('user_id', req.userId)
          .single();
        isPremium = (profile as any)?.is_premium ?? false;
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

    // Generate answer using real AI provider only - no fallbacks
    let result: AnswerResult;
    try {
      result = await generateAIAnswer(trimmedQuery, mode as Mode, actualModel, isPremium);
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
    }

    res.json(result);
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
