import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { optionalAuth, type AuthRequest } from '../middleware/auth.js';
import { getSubscriptionAccessForUser } from '../utils/subscriptionAccess.js';

const router = Router();

// Get all conversations for a user
router.get('/conversations', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const chatMode = (req.query.chatMode as string) || 'normal';

    // Pinned conversations bubble to the top; rest by most-recently-updated.
    // Postgres orders NULLs last by default with desc, so unpinned (is_pinned=false)
    // naturally fall below pinned ones.
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, title, chat_mode, created_at, updated_at, is_pinned, pinned_at')
      .eq('user_id', req.userId)
      .eq('chat_mode', chatMode)
      .order('is_pinned', { ascending: false, nullsFirst: false })
      .order('pinned_at', { ascending: false, nullsFirst: false })
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
    const parsedLimit = Number.parseInt(String(req.query.limit ?? ''), 10);
    const pageSize = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : 20;
    const beforeIso = typeof req.query.before === 'string' ? req.query.before : undefined;

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

    // Get conversation history (paginated — newest page first, scroll up for older)
    let historyQuery = supabase
      .from('conversation_history')
      .select('query, answer, created_at, model')
      .eq('conversation_id', conversationId);

    if (beforeIso) {
      historyQuery = historyQuery.lt('created_at', beforeIso);
    }

    const { data: rawHistory, error: historyError } = await historyQuery
      .order('created_at', { ascending: false })
      .limit(pageSize);

    const history = (rawHistory || []).slice().reverse();

    if (historyError) {
      console.error('Failed to fetch conversation history:', historyError);
      return res.status(500).json({ error: 'Failed to fetch conversation history' });
    }

    const oldestTimestamp = history[0]?.created_at || null;
    const hasMore = history.length === pageSize;

    res.json({
      conversation,
      messages: history || [],
      hasMore,
      oldestTimestamp,
      pageSize,
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
    // Either field is optional — pass `title` to rename, `pinned` to pin/unpin,
    // or both. Frontend uses this for both rename + pin actions.
    const schema = z.object({
      title: z.string().min(1).max(200).optional(),
      pinned: z.boolean().optional(),
    }).refine((d) => d.title !== undefined || d.pinned !== undefined, {
      message: 'At least one of `title` or `pinned` must be provided',
    });

    const parse = schema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parse.error.flatten().fieldErrors
      });
    }

    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (parse.data.title !== undefined) update.title = parse.data.title;

    // Tiered pin limit — pinning everything makes "pin" meaningless. Only
    // enforced when going from unpinned → pinned (unpin is always allowed).
    if (parse.data.pinned === true) {
      try {
        let tier = 'free';
        if (req.userId) {
          const access = await getSubscriptionAccessForUser(req.userId);
          tier = access.premiumTier;
        }
        // Pinning is a PAID feature — Pro 20 / Max 50. Caps are generous
        // enough that most users never hit them, but tight enough that the
        // pin feature stays meaningful (when everything is pinned, nothing
        // stands out). Free users get a clear upgrade prompt.
        const PIN_LIMIT: Record<string, number> = { free: 0, pro: 20, max: 50 };
        const limit = PIN_LIMIT[tier] ?? 0;

        if (limit === 0) {
          return res.status(403).json({
            error: 'Pinning conversations is a Pro / Max feature. Upgrade to pin your favourite chats to the top.',
            limitReached: true,
            limit: 0,
            tier,
          });
        }

        // Count currently-pinned conversations for this user (excluding this one,
        // in case they re-pin an already-pinned conversation, which is a no-op).
        const { count } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', req.userId)
          .eq('is_pinned', true)
          .neq('id', conversationId);

        if (count !== null && count >= limit) {
          const tierLabel = tier === 'pro' ? 'Pro' : 'Max';
          return res.status(409).json({
            error: `${tierLabel} plan allows up to ${limit} pinned conversations. Unpin one first${tier === 'pro' ? ', or upgrade to Max' : ''}.`,
            limitReached: true,
            limit,
            tier,
          });
        }
      } catch (pinLimitErr) {
        // If the limit check fails (e.g. column missing pre-migration), don't
        // block the pin — fail open.
        console.warn('Pin limit check failed (continuing):', pinLimitErr);
      }
    }

    if (parse.data.pinned !== undefined) {
      update.is_pinned = parse.data.pinned;
      update.pinned_at = parse.data.pinned ? new Date().toISOString() : null;
    }

    const { data: conversation, error } = await supabase
      .from('conversations')
      .update(update)
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
