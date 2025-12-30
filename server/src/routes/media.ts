import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { generateImage } from '../utils/imageGeneration.js';
import { generateVideo } from '../utils/videoGeneration.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

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

    // Check premium status (video requires Max tier)
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

    // Video generation requires Max tier
    if (premiumTier !== 'max') {
      return res.status(403).json({ 
        error: 'Video generation requires Max subscription',
        currentTier: premiumTier,
        requiredTier: 'max'
      });
    }

    // Generate video using Gemini Veo
    console.log(`🎥 Generating video with Max tier`);
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


