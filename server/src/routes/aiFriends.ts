import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import multer from 'multer';

const router = Router();

// Configure multer for memory storage (we'll upload directly to Supabase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const createAIFriendSchema = z.object({
  name: z.string().min(1).max(50, 'Name must be between 1 and 50 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(500, 'Description must be at most 500 characters'),
  logoUrl: z.string().optional(), // Can be a URL or default logo identifier
  defaultLogo: z.string().optional() // e.g., "avatar-1", "avatar-2", etc.
});

const updateAIFriendSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().min(10).max(500).optional(),
  logoUrl: z.string().optional(),
  defaultLogo: z.string().optional()
});

// Default logo options (5-6 avatar images)
const DEFAULT_LOGOS = [
  {
    id: 'avatar-1',
    name: 'Avatar 1',
    url: 'https://ui-avatars.com/api/?name=AI+Friend&background=C7A869&color=111&size=200&bold=true&font-size=0.5'
  },
  {
    id: 'avatar-2',
    name: 'Avatar 2',
    url: 'https://ui-avatars.com/api/?name=AI+Companion&background=10A37F&color=fff&size=200&bold=true&font-size=0.5'
  },
  {
    id: 'avatar-3',
    name: 'Avatar 3',
    url: 'https://ui-avatars.com/api/?name=AI+Buddy&background=6366F1&color=fff&size=200&bold=true&font-size=0.5'
  },
  {
    id: 'avatar-4',
    name: 'Avatar 4',
    url: 'https://ui-avatars.com/api/?name=AI+Pal&background=EC4899&color=fff&size=200&bold=true&font-size=0.5'
  },
  {
    id: 'avatar-5',
    name: 'Avatar 5',
    url: 'https://ui-avatars.com/api/?name=AI+Mate&background=F59E0B&color=111&size=200&bold=true&font-size=0.5'
  },
  {
    id: 'avatar-6',
    name: 'Avatar 6',
    url: 'https://ui-avatars.com/api/?name=AI+Friend&background=8B5CF6&color=fff&size=200&bold=true&font-size=0.5'
  }
];

// Get default logos
router.get('/ai-friends/default-logos', authenticateToken, async (req: AuthRequest, res) => {
  try {
    res.json({ logos: DEFAULT_LOGOS });
  } catch (error) {
    console.error('Get default logos error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload logo to Supabase Storage
router.post('/ai-friends/upload-logo', authenticateToken, upload.single('logo'), async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Generate unique filename: ai-friend-logos/{userId}/{timestamp}-{originalname}
    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `${req.userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `ai-friend-logos/${fileName}`;

    // Upload to Supabase Storage bucket 'ai-friend-logos'
    const { data, error } = await supabase.storage
      .from('ai-friend-logos')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) {
      console.error('Storage upload error:', error);
      return res.status(500).json({ error: 'Failed to upload logo' });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('ai-friend-logos')
      .getPublicUrl(filePath);

    res.json({ 
      url: urlData.publicUrl,
      path: filePath
    });
  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all AI friends for the logged-in user
router.get('/ai-friends', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data: friends, error } = await supabase
      .from('ai_friends')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching AI friends:', error);
      return res.status(500).json({ error: 'Failed to fetch AI friends' });
    }

    res.json({ friends: friends || [] });
  } catch (error) {
    console.error('Get AI friends error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific AI friend by ID
router.get('/ai-friends/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    const { data: friend, error } = await supabase
      .from('ai_friends')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'AI friend not found' });
      }
      console.error('Error fetching AI friend:', error);
      return res.status(500).json({ error: 'Failed to fetch AI friend' });
    }

    res.json({ friend });
  } catch (error) {
    console.error('Get AI friend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new AI friend
router.post('/ai-friends', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const parse = createAIFriendSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parse.error.flatten().fieldErrors
      });
    }

    const { name, description, logoUrl, defaultLogo } = parse.data;

    // Check if user already has 4 friends
    const { count, error: countError } = await supabase
      .from('ai_friends')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId);

    if (countError) {
      console.error('Error counting AI friends:', countError);
      return res.status(500).json({ error: 'Failed to check friend limit' });
    }

    if (count && count >= 4) {
      return res.status(400).json({ error: 'Maximum of 4 AI friends allowed per user' });
    }

    // Check if name already exists for this user
    const { data: existing } = await supabase
      .from('ai_friends')
      .select('id')
      .eq('user_id', req.userId)
      .eq('name', name.trim())
      .single();

    if (existing) {
      return res.status(400).json({ error: 'An AI friend with this name already exists' });
    }

    // Determine logo URL: use defaultLogo if provided, otherwise use logoUrl
    let finalLogoUrl: string | null = null;
    if (defaultLogo) {
      const defaultLogoObj = DEFAULT_LOGOS.find(l => l.id === defaultLogo);
      finalLogoUrl = defaultLogoObj?.url || null;
    } else if (logoUrl) {
      finalLogoUrl = logoUrl;
    }

    const { data: friend, error } = await supabase
      .from('ai_friends')
      .insert({
        user_id: req.userId,
        name: name.trim(),
        description: description.trim(),
        logo_url: finalLogoUrl
      } as any)
      .select()
      .single();

    if (error) {
      console.error('Error creating AI friend:', error);
      if (error.code === '23505') { // Unique constraint violation
        return res.status(400).json({ error: 'An AI friend with this name already exists' });
      }
      if (error.message?.includes('Maximum of 4')) {
        return res.status(400).json({ error: 'Maximum of 4 AI friends allowed per user' });
      }
      return res.status(500).json({ error: 'Failed to create AI friend' });
    }

    res.status(201).json({ friend });
  } catch (error) {
    console.error('Create AI friend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update an AI friend
router.put('/ai-friends/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const parse = updateAIFriendSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parse.error.flatten().fieldErrors
      });
    }

    const updates: any = {};
    if (parse.data.name !== undefined) {
      updates.name = parse.data.name.trim();
    }
    if (parse.data.description !== undefined) {
      updates.description = parse.data.description.trim();
    }
    
    // Handle logo update: defaultLogo takes precedence over logoUrl
    if (parse.data.defaultLogo !== undefined) {
      const defaultLogoObj = DEFAULT_LOGOS.find(l => l.id === parse.data.defaultLogo);
      updates.logo_url = defaultLogoObj?.url || null;
    } else if (parse.data.logoUrl !== undefined) {
      updates.logo_url = parse.data.logoUrl;
    }

    // If updating name, check for duplicates
    if (updates.name) {
      const { data: existing } = await supabase
        .from('ai_friends')
        .select('id')
        .eq('user_id', req.userId)
        .eq('name', updates.name)
        .neq('id', id)
        .single();

      if (existing) {
        return res.status(400).json({ error: 'An AI friend with this name already exists' });
      }
    }

    const { data: friend, error } = await supabase
      .from('ai_friends')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'AI friend not found' });
      }
      console.error('Error updating AI friend:', error);
      return res.status(500).json({ error: 'Failed to update AI friend' });
    }

    res.json({ friend });
  } catch (error) {
    console.error('Update AI friend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete an AI friend
router.delete('/ai-friends/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get friend to check if logo is in storage (needs cleanup)
    const { data: friend } = await supabase
      .from('ai_friends')
      .select('logo_url')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    // Delete logo from storage if it's a custom upload (contains 'ai-friend-logos')
    if (friend?.logo_url && friend.logo_url.includes('ai-friend-logos')) {
      try {
        // Extract path from URL
        const urlParts = friend.logo_url.split('/ai-friend-logos/');
        if (urlParts.length > 1) {
          const filePath = `ai-friend-logos/${urlParts[1]}`;
          await supabase.storage
            .from('ai-friend-logos')
            .remove([filePath]);
        }
      } catch (storageError) {
        console.warn('Failed to delete logo from storage:', storageError);
        // Continue with friend deletion even if storage cleanup fails
      }
    }

    const { error } = await supabase
      .from('ai_friends')
      .delete()
      .eq('id', id)
      .eq('user_id', req.userId);

    if (error) {
      console.error('Error deleting AI friend:', error);
      return res.status(500).json({ error: 'Failed to delete AI friend' });
    }

    res.json({ message: 'AI friend deleted successfully' });
  } catch (error) {
    console.error('Delete AI friend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
