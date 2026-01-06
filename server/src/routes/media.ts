import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { generateImage } from '../utils/imageGeneration.js';
import { generateVideo, generateVideoFromImage } from '../utils/videoGeneration.js';
import { supabase } from '../lib/supabase.js';
import multer from 'multer';

const router = Router();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for images
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Image generation schema
const imageSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty').max(500, 'Prompt too long'),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional().default('1:1')
});

// Video generation schema
const videoSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty').max(500, 'Prompt too long'),
  duration: z.number().min(2).max(10).optional().default(5), // 2-10 seconds
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional().default('16:9')
});

// Image-to-video generation schema (for form data)
const imageToVideoSchema = z.object({
  prompt: z.string().max(500, 'Prompt too long').optional().default(''), // Optional description
  duration: z.string().optional().default('5'), // Will be parsed to number
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional().default('16:9')
});

// POST /api/media/generate-image
router.post('/generate-image', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const parse = imageSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { prompt, aspectRatio } = parse.data;

    console.log(`🎨 Image generation request: "${prompt}" (${aspectRatio})`);

    // Check premium status (for free users, limit image generation)
    let isPremium = false;
    if (req.userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('premium_tier, subscription_status, subscription_end_date')
        .eq('user_id', req.userId)
        .single();
      
      if (profile) {
        const hasActiveSubscription = 
          profile.subscription_status === 'active' && 
          profile.subscription_end_date && 
          new Date(profile.subscription_end_date) > new Date();
        isPremium = (profile.premium_tier === 'pro' || profile.premium_tier === 'max') && hasActiveSubscription;
      }
    }

    // Free users: check daily limit
    if (!isPremium && req.userId) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const { count } = await supabase
        .from('generated_media')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.userId)
        .eq('media_type', 'image')
        .gte('created_at', todayStart.toISOString());
      
      if (count && count >= 3) { // Free users: 3 images per day
        return res.status(429).json({ 
          error: 'Daily image generation limit reached. Upgrade to Pro for unlimited generations.',
          limit: 3,
          used: count
        });
      }
    }

    // Generate image using Gemini Imagen (with DALL-E fallback)
    console.log(`🎨 Generating image with ${isPremium ? 'premium' : 'free'} tier`);
    const image = await generateImage(prompt, aspectRatio);

    if (!image) {
      return res.status(500).json({ 
        error: 'Failed to generate image. Please try again.' 
      });
    }

    // Determine which provider was used
    const provider = image.url.includes('openai') || image.url.includes('oaidalleapiprodscus') 
      ? 'openai' 
      : image.url.startsWith('data:image') 
        ? 'gemini' 
        : 'other';

    // Save to database if user is logged in
    if (req.userId) {
      try {
        await supabase
          .from('generated_media')
          .insert({
            user_id: req.userId,
            media_type: 'image',
            prompt: prompt,
            url: image.url,
            provider: provider,
            width: image.width,
            height: image.height,
            aspect_ratio: aspectRatio,
            metadata: {
              model: provider === 'gemini' ? 'imagen-3' : 'dall-e-3',
              timestamp: new Date().toISOString()
            }
          });
        console.log('✅ Image saved to database');
      } catch (dbError) {
        console.error('Failed to save image to database:', dbError);
        // Don't fail the request if DB save fails
      }
    }

    res.json({
      success: true,
      image: {
        url: image.url,
        prompt: image.prompt,
        width: image.width,
        height: image.height,
        aspectRatio: aspectRatio,
        provider: provider
      }
    });

  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/media/generate-video
router.post('/generate-video', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const parse = videoSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { prompt, duration, aspectRatio } = parse.data;

    console.log(`🎥 Video generation request: "${prompt}" (${duration}s, ${aspectRatio})`);

    // Check premium status (video requires Pro or Max tier)
    let premiumTier = 'free';
    if (req.userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('premium_tier, subscription_status, subscription_end_date')
        .eq('user_id', req.userId)
        .single();
      
      if (profile) {
        const hasActiveSubscription = 
          profile.subscription_status === 'active' && 
          profile.subscription_end_date && 
          new Date(profile.subscription_end_date) > new Date();
        
        if (hasActiveSubscription) {
          premiumTier = profile.premium_tier || 'free';
        }
      }
    }

    // Video generation requires Pro or Max tier
    if (premiumTier !== 'pro' && premiumTier !== 'max') {
      return res.status(403).json({ 
        error: 'Video generation requires Pro or Max subscription',
        currentTier: premiumTier,
        requiredTier: 'pro or max'
      });
    }

    // Check daily video generation limits
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const { count: videoCount } = await supabase
      .from('generated_media')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId)
      .eq('media_type', 'video')
      .gte('created_at', todayStart.toISOString());
    
    // Pro tier: 3 videos per day, Max tier: 6 videos per day
    const dailyLimit = premiumTier === 'max' ? 6 : 3;
    
    if (videoCount && videoCount >= dailyLimit) {
      return res.status(429).json({ 
        error: `Daily video generation limit reached. ${premiumTier === 'pro' ? 'Upgrade to Max for 6 videos per day.' : 'You have reached your daily limit of 6 videos.'}`,
        limit: dailyLimit,
        used: videoCount,
        tier: premiumTier
      });
    }

    // Generate video using Gemini Veo
    console.log(`🎥 Generating video with ${premiumTier} tier (${videoCount || 0}/${dailyLimit} used today)`);
    const video = await generateVideo(prompt, duration, aspectRatio);

    if (!video) {
      return res.status(500).json({ 
        error: 'Failed to generate video. Please try again.' 
      });
    }

    // Determine provider
    const provider = video.url.includes('openai') ? 'openai' : 'gemini';

    // Save to database
    if (req.userId) {
      try {
        await supabase
          .from('generated_media')
          .insert({
            user_id: req.userId,
            media_type: 'video',
            prompt: prompt,
            url: video.url,
            provider: provider,
            width: video.width,
            height: video.height,
            aspect_ratio: aspectRatio,
            duration: duration,
            metadata: {
              model: provider === 'gemini' ? 'veo-3.1' : 'sora',
              timestamp: new Date().toISOString()
            }
          });
        console.log('✅ Video saved to database');
      } catch (dbError) {
        console.error('Failed to save video to database:', dbError);
        // Don't fail the request if DB save fails
      }
    }

    res.json({
      success: true,
      video: {
        url: video.url,
        prompt: video.prompt,
        duration: video.duration,
        width: video.width,
        height: video.height,
        aspectRatio: aspectRatio,
        provider: provider
      }
    });

  } catch (error) {
    console.error('Video generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/media/generate-video-from-image - Generate video from uploaded image
router.post('/generate-video-from-image', optionalAuth, upload.single('image'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    // Parse form data
    const parse = imageToVideoSchema.safeParse({
      prompt: req.body.prompt || '',
      duration: req.body.duration || '5',
      aspectRatio: req.body.aspectRatio || '16:9'
    });

    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { prompt, duration: durationStr, aspectRatio } = parse.data;
    const duration = parseInt(durationStr) || 5;

    // Validate duration
    if (duration < 2 || duration > 10) {
      return res.status(400).json({ error: 'Duration must be between 2 and 10 seconds' });
    }

    console.log(`🎥 Image-to-video generation request: "${prompt || 'No description'}" (${duration}s, ${aspectRatio})`);

    // Check premium status (video requires Pro or Max tier)
    let premiumTier = 'free';
    if (req.userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('premium_tier, subscription_status, subscription_end_date')
        .eq('user_id', req.userId)
        .single();
      
      if (profile) {
        const hasActiveSubscription = 
          profile.subscription_status === 'active' && 
          profile.subscription_end_date && 
          new Date(profile.subscription_end_date) > new Date();
        
        if (hasActiveSubscription) {
          premiumTier = profile.premium_tier || 'free';
        }
      }
    }

    // Video generation requires Pro or Max tier
    if (premiumTier !== 'pro' && premiumTier !== 'max') {
      return res.status(403).json({ 
        error: 'Video generation requires Pro or Max subscription',
        currentTier: premiumTier,
        requiredTier: 'pro or max'
      });
    }

    // Check daily video generation limits
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const { count: videoCount } = await supabase
      .from('generated_media')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId)
      .eq('media_type', 'video')
      .gte('created_at', todayStart.toISOString());
    
    // Pro tier: 3 videos per day, Max tier: 6 videos per day
    const dailyLimit = premiumTier === 'max' ? 6 : 3;
    
    if (videoCount && videoCount >= dailyLimit) {
      return res.status(429).json({ 
        error: `Daily video generation limit reached. ${premiumTier === 'pro' ? 'Upgrade to Max for 6 videos per day.' : 'You have reached your daily limit of 6 videos.'}`,
        limit: dailyLimit,
        used: videoCount,
        tier: premiumTier
      });
    }

    // Convert image buffer to base64 data URL
    const imageBase64 = req.file.buffer.toString('base64');
    const imageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;

    // Generate video from image using Gemini Veo or RunPod
    console.log(`🎥 Generating video from image with ${premiumTier} tier (${videoCount || 0}/${dailyLimit} used today)`);
    const video = await generateVideoFromImage(imageDataUrl, prompt || undefined, duration, aspectRatio);

    if (!video) {
      return res.status(500).json({ 
        error: 'Failed to generate video from image. Please try again.' 
      });
    }

    // Determine provider
    const provider = video.url.includes('openai') ? 'openai' : video.url.includes('supabase') ? 'runpod' : 'gemini';

    // Save to database
    if (req.userId) {
      try {
        await supabase
          .from('generated_media')
          .insert({
            user_id: req.userId,
            media_type: 'video',
            prompt: prompt || 'Video generated from image',
            url: video.url,
            provider: provider,
            width: video.width,
            height: video.height,
            aspect_ratio: aspectRatio,
            duration: duration,
            metadata: {
              model: provider === 'runpod' ? 'skyreels-i2v' : provider === 'gemini' ? 'veo-3.1' : 'sora',
              source: 'image-to-video',
              timestamp: new Date().toISOString()
            }
          });
        console.log('✅ Video saved to database');
      } catch (dbError) {
        console.error('Failed to save video to database:', dbError);
        // Don't fail the request if DB save fails
      }
    }

    res.json({
      success: true,
      video: {
        url: video.url,
        prompt: prompt || 'Video generated from image',
        duration: video.duration,
        width: video.width,
        height: video.height,
        aspectRatio: aspectRatio,
        provider: provider,
        source: 'image'
      }
    });

  } catch (error) {
    console.error('Image-to-video generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/media/gallery - Get user's generated media (images and videos)
router.get('/gallery', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get query parameters for filtering and pagination
    const mediaType = req.query.type as 'image' | 'video' | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100); // Max 100 items
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    // Build query
    let query = supabase
      .from('generated_media')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by media type if provided
    if (mediaType && (mediaType === 'image' || mediaType === 'video')) {
      query = query.eq('media_type', mediaType);
    }

    const { data: media, error } = await query;

    if (error) {
      console.error('Error fetching gallery:', error);
      return res.status(500).json({ error: 'Failed to fetch gallery' });
    }

    res.json({ 
      media: media || [],
      total: media?.length || 0,
      limit,
      offset
    });
  } catch (error) {
    console.error('Gallery fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/media/quota - Get user's video generation quota
router.get('/quota', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user's premium tier
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('premium_tier, subscription_status, subscription_end_date')
      .eq('user_id', req.userId)
      .single();
    
    let premiumTier = 'free';
    if (profile) {
      const hasActiveSubscription = 
        profile.subscription_status === 'active' && 
        profile.subscription_end_date && 
        new Date(profile.subscription_end_date) > new Date();
      
      if (hasActiveSubscription) {
        premiumTier = profile.premium_tier || 'free';
      }
    }

    // Get today's video count
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const { count: videoCount } = await supabase
      .from('generated_media')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId)
      .eq('media_type', 'video')
      .gte('created_at', todayStart.toISOString());

    // Get today's image count
    const { count: imageCount } = await supabase
      .from('generated_media')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId)
      .eq('media_type', 'image')
      .gte('created_at', todayStart.toISOString());

    // Determine limits based on tier
    const videoLimit = premiumTier === 'max' ? 6 : premiumTier === 'pro' ? 3 : 0;
    const imageLimit = (premiumTier === 'pro' || premiumTier === 'max') ? -1 : 3; // -1 means unlimited

    res.json({
      tier: premiumTier,
      video: {
        used: videoCount || 0,
        limit: videoLimit,
        remaining: videoLimit - (videoCount || 0),
        hasAccess: premiumTier === 'pro' || premiumTier === 'max'
      },
      image: {
        used: imageCount || 0,
        limit: imageLimit,
        remaining: imageLimit === -1 ? -1 : imageLimit - (imageCount || 0),
        hasAccess: true
      },
      resetTime: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString() // Next midnight
    });
  } catch (error) {
    console.error('Get quota error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/media/my-media - Get user's generated media
router.get('/my-media', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const mediaType = req.query.type as 'image' | 'video' | 'all' | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = supabase
      .from('generated_media')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (mediaType && mediaType !== 'all') {
      query = query.eq('media_type', mediaType);
    }

    const { data: media, error } = await query;

    if (error) {
      console.error('Failed to fetch generated media:', error);
      return res.status(500).json({ error: 'Failed to fetch media' });
    }

    // Get total count
    let countQuery = supabase
      .from('generated_media')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId);

    if (mediaType && mediaType !== 'all') {
      countQuery = countQuery.eq('media_type', mediaType);
    }

    const { count } = await countQuery;

    res.json({
      media: media || [],
      total: count || 0,
      limit,
      offset
    });
  } catch (error) {
    console.error('Get media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/media/:id - Delete generated media
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const mediaId = req.params.id;

    // Delete only if user owns it
    const { error } = await supabase
      .from('generated_media')
      .delete()
      .eq('id', mediaId)
      .eq('user_id', req.userId);

    if (error) {
      console.error('Failed to delete media:', error);
      return res.status(500).json({ error: 'Failed to delete media' });
    }

    res.json({ success: true, message: 'Media deleted successfully' });
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;


