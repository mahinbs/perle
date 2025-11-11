import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const libraryItemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  content: z.string().min(1, 'Content is required').max(5000, 'Content too long'),
  source: z.string().min(1, 'Source is required').max(200, 'Source too long'),
  url: z.string().url('Invalid URL').max(500, 'URL too long').optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  isBookmarked: z.boolean().default(false),
  tags: z.array(z.string().max(50)).max(10, 'Too many tags').default([])
});

const libraryUpdateSchema = libraryItemSchema.partial();

// Get all library items for user
router.get('/library', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const bookmarkedOnly = req.query.bookmarked === 'true';

    let query = supabase
      .from('library_items')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (bookmarkedOnly) {
      query = query.eq('is_bookmarked', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Library fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch library items' });
    }

    // Transform to match frontend format
    const items = (data || []).map(item => ({
      id: item.id,
      title: item.title,
      content: item.content,
      source: item.source,
      url: item.url || undefined,
      date: item.date,
      isBookmarked: item.is_bookmarked,
      tags: item.tags || []
    }));

    res.json(items);
  } catch (error) {
    console.error('Get library error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single library item
router.get('/library/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    const { data, error } = await supabase
      .from('library_items')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Library item not found' });
      }
      return res.status(500).json({ error: 'Failed to fetch library item' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Library item not found' });
    }

    res.json({
      id: data.id,
      title: data.title,
      content: data.content,
      source: data.source,
      url: data.url || undefined,
      date: data.date,
      isBookmarked: data.is_bookmarked,
      tags: data.tags || []
    });
  } catch (error) {
    console.error('Get library item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create library item
router.post('/library', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const parse = libraryItemSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const itemData = parse.data;

    const { data, error } = await supabase
      .from('library_items')
      .insert({
        user_id: req.userId,
        title: itemData.title.trim(),
        content: itemData.content.trim(),
        source: itemData.source.trim(),
        url: itemData.url?.trim() || null,
        date: itemData.date,
        is_bookmarked: itemData.isBookmarked,
        tags: itemData.tags || []
      })
      .select()
      .single();

    if (error) {
      console.error('Create library item error:', error);
      return res.status(500).json({ error: 'Failed to create library item' });
    }

    res.status(201).json({
      id: data.id,
      title: data.title,
      content: data.content,
      source: data.source,
      url: data.url || undefined,
      date: data.date,
      isBookmarked: data.is_bookmarked,
      tags: data.tags || []
    });
  } catch (error) {
    console.error('Create library item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update library item
router.patch('/library/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    const parse = libraryUpdateSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const updates = parse.data;

    // Check if item exists and belongs to user
    const { data: existing } = await supabase
      .from('library_items')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Library item not found' });
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.title !== undefined) {
      updateData.title = updates.title.trim();
    }
    if (updates.content !== undefined) {
      updateData.content = updates.content.trim();
    }
    if (updates.source !== undefined) {
      updateData.source = updates.source.trim();
    }
    if (updates.url !== undefined) {
      updateData.url = updates.url?.trim() || null;
    }
    if (updates.date !== undefined) {
      updateData.date = updates.date;
    }
    if (updates.isBookmarked !== undefined) {
      updateData.is_bookmarked = updates.isBookmarked;
    }
    if (updates.tags !== undefined) {
      updateData.tags = updates.tags;
    }

    const { data, error } = await supabase
      .from('library_items')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) {
      console.error('Update library item error:', error);
      return res.status(500).json({ error: 'Failed to update library item' });
    }

    res.json({
      id: data.id,
      title: data.title,
      content: data.content,
      source: data.source,
      url: data.url || undefined,
      date: data.date,
      isBookmarked: data.is_bookmarked,
      tags: data.tags || []
    });
  } catch (error) {
    console.error('Update library item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete library item
router.delete('/library/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    // Check if item exists and belongs to user
    const { data: existing } = await supabase
      .from('library_items')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Library item not found' });
    }

    const { error } = await supabase
      .from('library_items')
      .delete()
      .eq('id', id)
      .eq('user_id', req.userId);

    if (error) {
      console.error('Delete library item error:', error);
      return res.status(500).json({ error: 'Failed to delete library item' });
    }

    res.status(204).end();
  } catch (error) {
    console.error('Delete library item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
