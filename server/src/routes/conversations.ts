import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { optionalAuth, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get all conversations for a user
router.get('/conversations', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const chatMode = (req.query.chatMode as string) || 'normal';

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, title, chat_mode, created_at, updated_at')
      .eq('user_id', req.userId)
      .eq('chat_mode', chatMode)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch conversations:', error);
      return res.status(500).json({ error: 'Failed to fetch conversations' });
    }

    res.json({ conversations: conversations || [] });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new conversation
router.post('/conversations', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const schema = z.object({
      title: z.string().optional().default('New Chat'),
      chatMode: z.enum(['normal', 'ai_friend', 'ai_psychologist', 'space']).optional().default('normal'),
      aiFriendId: z.string().uuid().optional().nullable(),
      spaceId: z.string().uuid().optional().nullable()
    });

    const parse = schema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parse.error.flatten().fieldErrors
      });
    }

    const { title, chatMode, aiFriendId, spaceId } = parse.data;

    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        user_id: req.userId,
        title,
        chat_mode: chatMode,
        ai_friend_id: aiFriendId || null,
        space_id: spaceId || null
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create conversation:', error);
      return res.status(500).json({ error: 'Failed to create conversation' });
    }

    res.json({ conversation });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific conversation with its history
router.get('/conversations/:id', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const conversationId = req.params.id;

    // Get conversation metadata
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('user_id', req.userId)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get conversation history
    const { data: history, error: historyError } = await supabase
      .from('conversation_history')
      .select('query, answer, created_at, model')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (historyError) {
      console.error('Failed to fetch conversation history:', historyError);
      return res.status(500).json({ error: 'Failed to fetch conversation history' });
    }

    res.json({
      conversation,
      messages: history || []
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update conversation title
router.patch('/conversations/:id', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const conversationId = req.params.id;
    const schema = z.object({
      title: z.string().min(1).max(200)
    });

    const parse = schema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parse.error.flatten().fieldErrors
      });
    }

    const { title } = parse.data;

    const { data: conversation, error } = await supabase
      .from('conversations')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update conversation:', error);
      return res.status(500).json({ error: 'Failed to update conversation' });
    }

    res.json({ conversation });
  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete conversation
router.delete('/conversations/:id', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const conversationId = req.params.id;

    // Delete conversation (cascade will delete history)
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', req.userId);

    if (error) {
      console.error('Failed to delete conversation:', error);
      return res.status(500).json({ error: 'Failed to delete conversation' });
    }

    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
