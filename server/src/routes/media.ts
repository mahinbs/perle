import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { generateImage } from '../utils/imageGeneration.js';
import { generateVideo, generateVideoFromImage, uploadVideoToGeminiFileAPI } from '../utils/videoGeneration.js';
import { supabase } from '../lib/supabase.js';
import multer from 'multer';
import { 
  isEditRequest, 
  getLastGeneratedImage, 
  getLastGeneratedVideo, 
  saveMediaToConversationHistory,
  downloadImageAsDataUrl 
} from '../utils/mediaHelpers.js';

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

// Video generation schema (handles both JSON and FormData)
const videoSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty').max(500, 'Prompt too long'),
  duration: z.union([z.number(), z.string()]).optional().default(5), // Can be string (FormData) or number (JSON)
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional().default('16:9')
});

// Image-to-video generation schema (for form data)
const imageToVideoSchema = z.object({
  prompt: z.string().max(500, 'Prompt too long').optional().default(''), // Optional description
  duration: z.string().optional().default('5'), // Will be parsed to number
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional().default('16:9')
});

// POST /api/media/generate-image - Now supports optional reference image
router.post('/generate-image', optionalAuth, upload.single('referenceImage'), async (req: AuthRequest, res) => {
  try {
    const parse = imageSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { prompt, aspectRatio } = parse.data;
    
    // Check if this is an edit request and retrieve previous image as reference
    let referenceImageDataUrl: string | undefined;
    if (req.userId && isEditRequest(prompt) && !req.file) {
      console.log('🔍 Edit request detected - looking for previous image to use as reference...');
      const lastImage = await getLastGeneratedImage(req.userId);
      if (lastImage) {
        console.log(`🎨 Found previous image to edit: ${lastImage.prompt}`);
        // Download and convert to data URL for AI reference
        referenceImageDataUrl = await downloadImageAsDataUrl(lastImage.url) || undefined;
        if (referenceImageDataUrl) {
          console.log('✅ Using previous image as reference for editing');
        }
      } else {
        console.log('⚠️ No previous image found for editing');
      }
    }
    
    // Handle reference image if uploaded (takes priority over auto-detected)
    if (req.file && req.userId) {
      try {
        console.log(`📸 Reference image uploaded: ${req.file.mimetype}, ${(req.file.size / 1024).toFixed(2)}KB`);
        
        // Step 1: Upload to Supabase 'files' bucket (supports all MIME types!)
        const fileName = `reference-images/${req.userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${req.file.mimetype.split('/')[1]}`;
        
        const { error: uploadError } = await supabase.storage
          .from('files')
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
          });
        
        if (uploadError) {
          console.error('Failed to upload reference image to Supabase:', uploadError);
          // Fallback: use buffer directly
          const imageBase64 = req.file.buffer.toString('base64');
          referenceImageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
        } else {
          // Step 2: Get public URL
          const { data: urlData } = supabase.storage
            .from('files')
            .getPublicUrl(fileName);
          
          console.log(`✅ Reference image uploaded to Supabase: ${fileName}`);
          
          // Step 3: Download from Supabase and convert to base64
          const imageResponse = await fetch(urlData.publicUrl);
          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          const imageBase64 = imageBuffer.toString('base64');
          referenceImageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
          
          console.log(`✅ Reference image converted to base64 (${imageBase64.length} chars)`);
        }
        
        console.log(`🎨 Image generation request: "${prompt}" (${aspectRatio}) WITH reference image`);
      } catch (error) {
        console.error('Error processing reference image:', error);
        // Fallback: use buffer directly
        const imageBase64 = req.file.buffer.toString('base64');
        referenceImageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
        console.log(`🎨 Image generation request: "${prompt}" (${aspectRatio}) WITH reference image (direct buffer)`);
      }
    } else if (req.file) {
      // No userId but image uploaded - use buffer directly
      const imageBase64 = req.file.buffer.toString('base64');
      referenceImageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
      console.log(`🎨 Image generation request: "${prompt}" (${aspectRatio}) WITH reference image (no user)`);
    } else {
      console.log(`🎨 Image generation request: "${prompt}" (${aspectRatio})`);
    }

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
    const image = await generateImage(prompt, aspectRatio, referenceImageDataUrl);

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

    // Download image and upload to Supabase (like we do for videos)
    let finalImageUrl = image.url;
    
    if (req.userId) {
      try {
        console.log('📥 Downloading generated image...');
        
        let imageBuffer: Buffer;
        
        // Handle different URL types
        if (image.url.startsWith('data:image')) {
          // Gemini returns base64 data URL
          const base64Data = image.url.split(',')[1];
          imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
          // OpenAI/DALL-E returns regular URL
          const imageResponse = await fetch(image.url);
          if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.status}`);
          }
          imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        }
        
        const imageSizeMB = (imageBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`📦 Image size: ${imageSizeMB}MB`);
        
        // Upload to Supabase Storage
        const fileName = `${req.userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
        
        const { error: uploadError } = await supabase.storage
          .from('generated-images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/png',
            upsert: false
          });
        
        if (uploadError) {
          console.error('Supabase upload error:', uploadError);
          throw uploadError;
        }
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('generated-images')
          .getPublicUrl(fileName);
        
        finalImageUrl = urlData.publicUrl;
        console.log(`✅ Image uploaded to Supabase: ${imageSizeMB}MB`);
      } catch (uploadError) {
        console.error('Failed to download/upload image:', uploadError);
        // Fall back to original URL if upload fails
        console.log('⚠️ Using original image URL (may expire soon!)');
      }
    }

    // Save to database if user is logged in
    if (req.userId) {
      try {
        await supabase
          .from('generated_media')
          .insert({
            user_id: req.userId,
            media_type: 'image',
            prompt: prompt,
            url: finalImageUrl,
            provider: provider,
            width: image.width,
            height: image.height,
            aspect_ratio: aspectRatio,
            metadata: {
              model: provider === 'gemini' ? 'imagen-3' : 'dall-e-3',
              timestamp: new Date().toISOString(),
              originalUrl: image.url
            }
          });
        console.log('✅ Image saved to database');
        
        // Also save to conversation history for editing context
        await saveMediaToConversationHistory(
          req.userId,
          finalImageUrl, // imageUrl
          null, // videoUrl
          prompt,
          'normal'
        );
      } catch (dbError) {
        console.error('Failed to save image to database:', dbError);
        // Don't fail the request if DB save fails
      }
    }

    res.json({
      success: true,
      image: {
        url: finalImageUrl,
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

// POST /api/media/generate-video - Now supports optional reference image
router.post('/generate-video', optionalAuth, (req, res, next) => {
  upload.single('referenceImage')(req, res, (err: any) => {
    if (err) {
      console.error('Generate-video upload error:', err.message);
      return res.status(400).json({
        error: err.message?.includes('image') ? 'Reference must be an image file (video not supported as reference yet)' : (err.message || 'Invalid file')
      });
    }
    next();
  });
}, async (req: AuthRequest, res) => {
  try {
    const parse = videoSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { prompt, duration, aspectRatio } = parse.data;
    
    // Check if this is an edit request: use WHOLE VIDEO as reference (File API file_uri) when available
    let referenceImageDataUrl: string | undefined;
    let referenceVideoFileUri: string | undefined;
    if (req.userId && isEditRequest(prompt) && !req.file) {
      console.log('🔍 Edit request detected - looking for previous video to use as reference...');
      const lastVideo = await getLastGeneratedVideo(req.userId);
      const lastImage = await getLastGeneratedImage(req.userId);
      // Best practice: pass the whole video as reference (video-to-video) via File API file_uri
      if (lastVideo) {
        const storedUri = (lastVideo.metadata as any)?.gemini_file_uri;
        if (storedUri) {
          referenceVideoFileUri = storedUri;
          console.log('✅ Using stored Gemini file_uri as reference video (video-to-video)');
        } else {
          try {
            const videoRes = await fetch(lastVideo.url);
            const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
            referenceVideoFileUri = (await uploadVideoToGeminiFileAPI(videoBuffer)) ?? undefined;
            if (referenceVideoFileUri) {
              console.log('✅ Uploaded last video to File API, using as reference (video-to-video)');
            }
          } catch (e) {
            console.error('Failed to get reference video file_uri:', e);
          }
        }
      }
      if (!referenceVideoFileUri && lastImage) {
        console.log(`🎨 No video reference - using previous image as reference: ${lastImage.prompt}`);
        referenceImageDataUrl = await downloadImageAsDataUrl(lastImage.url) || undefined;
      }
      if (!referenceVideoFileUri && !referenceImageDataUrl) {
        console.log('⚠️ No previous media found for editing');
      }
    }
    
    // Handle reference image if uploaded (takes priority over auto-detected)
    if (req.file && req.userId) {
      try {
        console.log(`📸 Reference image uploaded: ${req.file.mimetype}, ${(req.file.size / 1024).toFixed(2)}KB`);
        
        // Step 1: Upload to Supabase 'files' bucket (supports all MIME types!)
        const fileName = `reference-images/${req.userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${req.file.mimetype.split('/')[1]}`;
        
        const { error: uploadError } = await supabase.storage
          .from('files')
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
          });
        
        if (uploadError) {
          console.error('Failed to upload reference image to Supabase:', uploadError);
          // Fallback: use buffer directly
          const imageBase64 = req.file.buffer.toString('base64');
          referenceImageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
        } else {
          // Step 2: Get public URL
          const { data: urlData } = supabase.storage
            .from('files')
            .getPublicUrl(fileName);
          
          console.log(`✅ Reference image uploaded to Supabase: ${fileName}`);
          
          // Step 3: Download from Supabase and convert to base64
          const imageResponse = await fetch(urlData.publicUrl);
          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          const imageBase64 = imageBuffer.toString('base64');
          referenceImageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
          
          console.log(`✅ Reference image converted to base64 (${imageBase64.length} chars)`);
        }
        
        console.log(`🎥 Video generation request: "${prompt}" (${duration}s, ${aspectRatio}) WITH reference image`);
      } catch (error) {
        console.error('Error processing reference image:', error);
        // Fallback: use buffer directly
        const imageBase64 = req.file.buffer.toString('base64');
        referenceImageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
        console.log(`🎥 Video generation request: "${prompt}" (${duration}s, ${aspectRatio}) WITH reference image (direct buffer)`);
      }
    } else if (req.file) {
      // No userId but image uploaded - use buffer directly
      const imageBase64 = req.file.buffer.toString('base64');
      referenceImageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
      console.log(`🎥 Video generation request: "${prompt}" (${duration}s, ${aspectRatio}) WITH reference image (no user)`);
    } else {
      console.log(`🎥 Video generation request: "${prompt}" (${duration}s, ${aspectRatio})`);
    }

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
    
    // Pro tier: 6 videos per day, Max tier: 12 videos per day (DOUBLED)
    const dailyLimit = premiumTier === 'max' ? 12 : 6;
    
    if (videoCount && videoCount >= dailyLimit) {
      return res.status(429).json({ 
        error: `Daily video generation limit reached. ${premiumTier === 'pro' ? 'Upgrade to Max for 12 videos per day.' : 'You have reached your daily limit of 12 videos.'}`,
        limit: dailyLimit,
        used: videoCount,
        tier: premiumTier
      });
    }

    // Ensure duration is a number
    const durationNum = typeof duration === 'string' ? parseInt(duration) || 5 : duration;
    
    // Generate video using Gemini Veo (with optional reference image or reference video file_uri)
    console.log(`🎥 Generating video with ${premiumTier} tier (${videoCount || 0}/${dailyLimit} used today)`);
    const video = await generateVideo(prompt, durationNum, aspectRatio, referenceImageDataUrl, referenceVideoFileUri ?? undefined);

    if (!video) {
      return res.status(500).json({ 
        error: 'Failed to generate video. Please try again.' 
      });
    }

    // Determine provider
    const provider = video.url.includes('openai') ? 'openai' : 'gemini';

    // Gemini video URLs are temporary - download IMMEDIATELY and upload to Supabase
    let finalVideoUrl = video.url;
    
    if (provider === 'gemini' && req.userId) {
      try {
        console.log('📥 Downloading video from Gemini (temporary URL)...');
        
        // Always use the free Gemini API key
        const geminiApiKey = (process.env.GEMINI_API_KEY_FREE || process.env.GOOGLE_API_KEY_FREE || process.env.GOOGLE_API_KEY)?.trim();
        
        if (!geminiApiKey) {
          throw new Error('Gemini/Google API key is missing');
        }
        
        console.log(`🔗 Fetching: ${video.url}`);
        
        // Use header authentication instead of query param
        const videoResponse = await fetch(video.url, {
          headers: {
            'x-goog-api-key': geminiApiKey
          }
        });
        
        if (!videoResponse.ok) {
          const errorText = await videoResponse.text();
          console.error(`Download failed: ${videoResponse.status}`, errorText.substring(0, 300));
          throw new Error(`Failed to download video: ${videoResponse.status}`);
        }
        
        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        const videoSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`📦 Video size: ${videoSizeMB}MB`);
        
        // Upload to Gemini File API so we can use file_uri as reference for "make it better" (video-to-video)
        try {
          const geminiFileUri = await uploadVideoToGeminiFileAPI(videoBuffer) || undefined;
          if (geminiFileUri) {
            (res as any).locals = (res as any).locals || {};
            (res as any).locals.geminiFileUri = geminiFileUri;
            console.log('✅ Video uploaded to File API for future reference (video-to-video)');
          }
        } catch (e) {
          console.warn('File API upload for reference failed (non-blocking):', (e as Error)?.message);
        }
        
        // Upload to Supabase Storage
        const fileName = `${req.userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
        
        const { error: uploadError } = await supabase.storage
          .from('generated-videos')
          .upload(fileName, videoBuffer, {
            contentType: 'video/mp4',
            upsert: false
          });
        
        if (uploadError) {
          console.error('Supabase upload error:', uploadError);
          throw uploadError;
        }
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('generated-videos')
          .getPublicUrl(fileName);
        
        finalVideoUrl = urlData.publicUrl;
        console.log(`✅ Video uploaded to Supabase: ${videoSizeMB}MB`);
        
      } catch (error) {
        console.error('Failed to download/upload video:', error);
        console.warn('⚠️ Using original Gemini URL (will expire soon!)');
        // Keep original URL as fallback (but it will expire!)
      }
    }

    // Save to database (include gemini_file_uri when we have it for video-to-video reference)
    if (req.userId) {
      try {
        const insertMetadata: Record<string, unknown> = {
          model: provider === 'gemini' ? 'veo-3.1' : 'sora',
          timestamp: new Date().toISOString(),
          originalUrl: video.url
        };
        if ((res as any).locals?.geminiFileUri) {
          insertMetadata.gemini_file_uri = (res as any).locals.geminiFileUri;
        }
        await supabase
          .from('generated_media')
          .insert({
            user_id: req.userId,
            media_type: 'video',
            prompt: prompt,
            url: finalVideoUrl,
            provider: provider,
            width: video.width,
            height: video.height,
            aspect_ratio: aspectRatio,
            duration: durationNum,
            metadata: insertMetadata
          });
        console.log('✅ Video saved to database');
        
        // Also save to conversation history for editing context
        await saveMediaToConversationHistory(
          req.userId,
          null, // imageUrl
          finalVideoUrl, // videoUrl
          prompt,
          'normal'
        );
      } catch (dbError) {
        console.error('Failed to save video to database:', dbError);
        // Don't fail the request if DB save fails
      }
    }

    res.json({
      success: true,
      video: {
        url: finalVideoUrl,
        prompt: video.prompt,
        duration: video.duration,
        width: video.width,
        height: video.height,
        aspectRatio: aspectRatio,
        provider: provider
      }
    });

  } catch (error: any) {
    console.error('Video generation error:', error);
    const message = error?.message || 'Internal server error';
    const isClientError = message.includes('Only image') || message.includes('file type') || message.includes('Invalid request');
    res.status(isClientError ? 400 : 500).json({
      error: process.env.NODE_ENV === 'development' ? message : (isClientError ? message : 'Internal server error')
    });
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
    
    // Pro tier: 6 videos per day, Max tier: 12 videos per day (DOUBLED)
    const dailyLimit = premiumTier === 'max' ? 12 : 6;
    
    if (videoCount && videoCount >= dailyLimit) {
      return res.status(429).json({ 
        error: `Daily video generation limit reached. ${premiumTier === 'pro' ? 'Upgrade to Max for 12 videos per day.' : 'You have reached your daily limit of 12 videos.'}`,
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
        
        // Also save to conversation history for editing context
        await saveMediaToConversationHistory(
          req.userId,
          null, // imageUrl
          video.url, // videoUrl
          prompt || 'Video generated from image',
          'normal'
        );
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

// GET /api/media/proxy-video/:fileId - Proxy Gemini video downloads
router.get('/proxy-video/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }
    
    // Construct Gemini download URL with API key (use free key first)
    const geminiApiKey = process.env.GEMINI_API_KEY_FREE || process.env.GOOGLE_API_KEY_FREE || process.env.GOOGLE_API_KEY;
    const downloadUrl = `https://generativelanguage.googleapis.com/v1beta/files/${fileId}:download?alt=media&key=${geminiApiKey}`;
    
    console.log(`📥 Proxying video download for file: ${fileId}`);
    
    // Fetch video from Gemini
    const videoResponse = await fetch(downloadUrl);
    
    if (!videoResponse.ok) {
      const errorText = await videoResponse.text();
      console.error(`Failed to fetch video from Gemini: ${videoResponse.status}`, errorText);
      return res.status(videoResponse.status).json({ 
        error: 'Failed to fetch video from Gemini',
        details: errorText 
      });
    }
    
    // Get content type and content length
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    const contentLength = videoResponse.headers.get('content-length');
    
    // Set response headers
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    
    // Stream the video to the client
    const arrayBuffer = await videoResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    res.send(buffer);
    
  } catch (error) {
    console.error('Video proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;


