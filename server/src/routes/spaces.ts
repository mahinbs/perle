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

const createSpaceSchema = z.object({
  title: z.string().min(1).max(100, 'Title must be between 1 and 100 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(1000, 'Description must be at most 1000 characters'),
  logoUrl: z.string().optional(), // Can be a URL or default logo identifier
  defaultLogo: z.string().optional(), // e.g., "avatar-1", "avatar-2", etc.
  isPublic: z.boolean().optional().default(false) // Public or private space
});

const updateSpaceSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(10).max(1000).optional(),
  logoUrl: z.string().optional(),
  defaultLogo: z.string().optional(),
  isPublic: z.boolean().optional()
});

// Default logo options (same as AI friends)
const DEFAULT_LOGOS = [
  {
    id: 'avatar-1',
    name: 'Avatar 1',
    url: 'https://ui-avatars.com/api/?name=Space&background=C7A869&color=111&size=200&bold=true&font-size=0.5'
  },
  {
    id: 'avatar-2',
    name: 'Avatar 2',
    url: 'https://ui-avatars.com/api/?name=Space&background=10A37F&color=fff&size=200&bold=true&font-size=0.5'
  },
  {
    id: 'avatar-3',
    name: 'Avatar 3',
    url: 'https://ui-avatars.com/api/?name=Space&background=6366F1&color=fff&size=200&bold=true&font-size=0.5'
  },
  {
    id: 'avatar-4',
    name: 'Avatar 4',
    url: 'https://ui-avatars.com/api/?name=Space&background=EC4899&color=fff&size=200&bold=true&font-size=0.5'
  },
  {
    id: 'avatar-5',
    name: 'Avatar 5',
    url: 'https://ui-avatars.com/api/?name=Space&background=F59E0B&color=111&size=200&bold=true&font-size=0.5'
  },
  {
    id: 'avatar-6',
    name: 'Avatar 6',
    url: 'https://ui-avatars.com/api/?name=Space&background=8B5CF6&color=fff&size=200&bold=true&font-size=0.5'
  }
];

// Get default logos
router.get('/spaces/default-logos', authenticateToken, async (req: AuthRequest, res) => {
  try {
    res.json({ logos: DEFAULT_LOGOS });
  } catch (error) {
    console.error('Get default logos error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload logo to Supabase Storage (reuse ai-friend-logos bucket or create space-logos)
router.post('/spaces/upload-logo', authenticateToken, upload.single('logo'), async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Generate unique filename: {userId}/{timestamp}-{random}.{ext}
    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${req.userId}/${fileName}`;

    console.log(`📤 Uploading space logo to ai-friend-logos bucket: ${filePath}`);

    // Upload to Supabase Storage bucket 'ai-friend-logos' (reusing same bucket)
    const { data, error } = await supabase.storage
      .from('ai-friend-logos')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) {
      console.error('❌ Storage upload error:', error);
      return res.status(500).json({ 
        error: 'Failed to upload logo',
        details: error.message 
      });
    }

    console.log('✅ Logo uploaded successfully:', data?.path);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('ai-friend-logos')
      .getPublicUrl(filePath);
    
    console.log('🔗 Public URL:', urlData.publicUrl);

    res.json({ 
      url: urlData.publicUrl,
      path: filePath,
      bucket: 'ai-friend-logos'
    });
  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all spaces for the logged-in user (their own spaces)
router.get('/spaces', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data: spaces, error } = await supabase
      .from('spaces')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching spaces:', error);
      return res.status(500).json({ error: 'Failed to fetch spaces' });
    }

    res.json({ spaces: spaces || [] });
  } catch (error) {
    console.error('Get spaces error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get public spaces (community spaces)
router.get('/spaces/public', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const { data: spaces, error } = await supabase
      .from('spaces')
      .select('id, title, description, logo_url, created_at, user_id')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching public spaces:', error);
      return res.status(500).json({ error: 'Failed to fetch public spaces' });
    }

    res.json({ spaces: spaces || [] });
  } catch (error) {
    console.error('Get public spaces error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific space by ID (works for own spaces and public spaces)
router.get('/spaces/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // First try to get as owner
    const { data: ownSpace, error: ownError } = await supabase
      .from('spaces')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (ownSpace) {
      return res.json({ space: ownSpace });
    }

    // If not owner, check if it's public
    const { data: publicSpace, error: publicError } = await supabase
      .from('spaces')
      .select('id, title, description, logo_url, created_at, user_id, is_public')
      .eq('id', id)
      .eq('is_public', true)
      .single();

    if (publicSpace) {
      return res.json({ space: publicSpace });
    }

    if (publicError && publicError.code === 'PGRST116') {
      return res.status(404).json({ error: 'Space not found or not accessible' });
    }

    console.error('Error fetching space:', publicError);
    return res.status(500).json({ error: 'Failed to fetch space' });
  } catch (error) {
    console.error('Get space error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new space
router.post('/spaces', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const parse = createSpaceSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parse.error.flatten().fieldErrors
      });
    }

    const { title, description, logoUrl, defaultLogo, isPublic } = parse.data;

    // Check if title already exists for this user
    const { data: existing } = await supabase
      .from('spaces')
      .select('id')
      .eq('user_id', req.userId)
      .eq('title', title.trim())
      .single();

    if (existing) {
      return res.status(400).json({ error: 'A space with this title already exists' });
    }

    // Determine logo URL: use defaultLogo if provided, otherwise use logoUrl
    let finalLogoUrl: string | null = null;
    if (defaultLogo) {
      const defaultLogoObj = DEFAULT_LOGOS.find(l => l.id === defaultLogo);
      finalLogoUrl = defaultLogoObj?.url || null;
    } else if (logoUrl) {
      finalLogoUrl = logoUrl;
    }

    const { data: space, error } = await supabase
      .from('spaces')
      .insert({
        user_id: req.userId,
        title: title.trim(),
        description: description.trim(),
        logo_url: finalLogoUrl,
        is_public: isPublic || false
      } as any)
      .select()
      .single();

    if (error) {
      console.error('Error creating space:', error);
      if (error.code === '23505') { // Unique constraint violation
        return res.status(400).json({ error: 'A space with this title already exists' });
      }
      return res.status(500).json({ error: 'Failed to create space' });
    }

    res.status(201).json({ space });
  } catch (error) {
    console.error('Create space error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a space
router.put('/spaces/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const parse = updateSpaceSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parse.error.flatten().fieldErrors
      });
    }

    const updates: any = {};
    if (parse.data.title !== undefined) {
      updates.title = parse.data.title.trim();
    }
    if (parse.data.description !== undefined) {
      updates.description = parse.data.description.trim();
    }
    if (parse.data.isPublic !== undefined) {
      updates.is_public = parse.data.isPublic;
    }
    
    // Handle logo update: defaultLogo takes precedence over logoUrl
    if (parse.data.defaultLogo !== undefined) {
      const defaultLogoObj = DEFAULT_LOGOS.find(l => l.id === parse.data.defaultLogo);
      updates.logo_url = defaultLogoObj?.url || null;
    } else if (parse.data.logoUrl !== undefined) {
      updates.logo_url = parse.data.logoUrl;
    }

    // If updating title, check for duplicates
    if (updates.title) {
      const { data: existing } = await supabase
        .from('spaces')
        .select('id')
        .eq('user_id', req.userId)
        .eq('title', updates.title)
        .neq('id', id)
        .single();

      if (existing) {
        return res.status(400).json({ error: 'A space with this title already exists' });
      }
    }

    const { data: space, error } = await supabase
      .from('spaces')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Space not found' });
      }
      console.error('Error updating space:', error);
      return res.status(500).json({ error: 'Failed to update space' });
    }

    res.json({ space });
  } catch (error) {
    console.error('Update space error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a space
router.delete('/spaces/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get space to check if logo is in storage (needs cleanup)
    const { data: space } = await supabase
      .from('spaces')
      .select('logo_url')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    // Delete logo from storage if it's a custom upload (contains 'ai-friend-logos')
    if (space?.logo_url && space.logo_url.includes('ai-friend-logos')) {
      try {
        // Extract path from URL
        const urlParts = space.logo_url.split('/ai-friend-logos/');
        if (urlParts.length > 1) {
          const filePath = urlParts[1]; // Just the path after bucket name: {userId}/{filename}
          console.log(`🗑️ Deleting space logo from storage: ${filePath}`);
          const { error: deleteError } = await supabase.storage
            .from('ai-friend-logos')
            .remove([filePath]);
          
          if (deleteError) {
            console.warn('Failed to delete logo from storage:', deleteError);
          } else {
            console.log('✅ Logo deleted from storage successfully');
          }
        }
      } catch (storageError) {
        console.warn('Failed to delete logo from storage:', storageError);
        // Continue with space deletion even if storage cleanup fails
      }
    }

    const { error } = await supabase
      .from('spaces')
      .delete()
      .eq('id', id)
      .eq('user_id', req.userId);

    if (error) {
      console.error('Error deleting space:', error);
      return res.status(500).json({ error: 'Failed to delete space' });
    }

    res.json({ message: 'Space deleted successfully' });
  } catch (error) {
    console.error('Delete space error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

