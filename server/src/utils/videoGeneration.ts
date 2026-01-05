// Video generation using Google Gemini Veo API
// Note: OpenAI Sora is not yet available via API (as of Dec 2025)
// Gemini Veo is currently the primary option with NO fallback

export interface GeneratedVideo {
  url: string;
  prompt: string;
  duration: number;
  width: number;
  height: number;
}

// Generate video using Gemini Veo API
export async function generateVideoWithGemini(
  prompt: string, 
  duration: number = 5,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9'
): Promise<GeneratedVideo | null> {
  // Use the same API key as your Gemini chat
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_FREE;
  
  if (!apiKey) {
    console.warn('Google API key not configured. Skipping video generation.');
    return null;
  }
  
  try {
    console.log('═'.repeat(60));
    console.log(`🎥 [GEMINI VEO 3.1] Generating video`);
    console.log(`   Prompt: "${prompt}"`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Aspect Ratio: ${aspectRatio}`);
    console.log(`   API: https://generativelanguage.googleapis.com/v1beta/models/veo-001`);
    console.log('═'.repeat(60));
    
    // Calculate dimensions based on aspect ratio
    let width = 1280;
    let height = 720;
    
    if (aspectRatio === '9:16') {
      width = 720;
      height = 1280;
    } else if (aspectRatio === '1:1') {
      width = 720;
      height = 720;
    }
    
    // Use Gemini's Veo video generation endpoint
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/veo-001:generateVideo?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        videoDuration: `${duration}s`,
        aspectRatio: aspectRatio,
        safetySettings: {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini Veo error:', errorText);
      return null;
    }
    
    const data = await response.json();
    
    // Gemini Veo returns an operation ID for async processing
    const operationId = data.name || data.operationId;
    
    if (!operationId) {
      console.error('No operation ID returned from Gemini Veo');
      return null;
    }
    
    // Poll for video generation completion
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max wait (video takes longer)
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const statusResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationId}?key=${apiKey}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const statusData = await statusResponse.json();
      
      if (statusData.done) {
        if (statusData.error) {
          console.error('Video generation failed:', statusData.error);
          return null;
        }
        
        // Extract video URL from response
        const videoData = statusData.response?.videoData;
        const videoUrl = videoData?.uri || videoData?.url;
        
        if (videoUrl) {
          console.log('✅ Video generated successfully with Gemini Veo');
          return {
            url: videoUrl,
            prompt: prompt,
            duration: duration,
            width: width,
            height: height
          };
        }
      }
      
      attempts++;
    }
    
    console.warn('Video generation timed out');
    return null;
    
  } catch (error) {
    console.error('Error generating video with Gemini Veo:', error);
    return null;
  }
}

// Alternative: OpenAI Sora (NOT YET AVAILABLE via API)
// Keeping this as a placeholder for when Sora API becomes available
export async function generateVideoWithOpenAI(
  prompt: string,
  duration: number = 5,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9'
): Promise<GeneratedVideo | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ OpenAI API key not configured.');
    return null;
  }
  
  // NOTE: OpenAI Sora is NOT yet available via public API as of Dec 2025
  // When it becomes available, this endpoint will be something like:
  // POST https://api.openai.com/v1/videos/generations
  
  console.warn('⚠️ OpenAI Sora video generation is not yet available via API');
  console.warn('   Waiting for official Sora API release from OpenAI');
  console.warn('   Current alternatives: Gemini Veo, Runway ML, Stability AI');
  
  return null;
}

// Main function - uses Gemini Veo (no OpenAI fallback yet)
export async function generateVideo(
  prompt: string,
  duration: number = 5,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9'
): Promise<GeneratedVideo | null> {
  // Try Gemini Veo first
  try {
    const geminiVideo = await generateVideoWithGemini(prompt, duration, aspectRatio);
    if (geminiVideo) {
      return geminiVideo;
    }
  } catch (error) {
    console.error('⚠️ Gemini Veo video generation failed:', error);
  }
  
  // Try OpenAI Sora fallback (when available)
  // Currently not available, so this will return null
  console.log('🔄 Checking OpenAI Sora availability...');
  const openaiVideo = await generateVideoWithOpenAI(prompt, duration, aspectRatio);
  if (openaiVideo) {
    return openaiVideo;
  }
  
  // No video providers available
  console.error('❌ All video generation providers failed or unavailable');
  console.error('   - Gemini Veo: Failed (quota exceeded or error)');
  console.error('   - OpenAI Sora: Not yet available via API');
  console.error('   Please check API quotas or wait for Sora API release');
  
  return null;
}

// Generate video from image using Gemini Veo first, then OpenAI Sora (when available)
export async function generateVideoFromImage(
  imageDataUrl: string, // Base64 data URL or image URL
  prompt?: string, // Optional description/prompt
  duration: number = 5,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9'
): Promise<GeneratedVideo | null> {
  // Try Gemini Veo I2V first
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_FREE;
  
  if (apiKey) {
    try {
      console.log('═'.repeat(60));
      console.log(`🎥 [GEMINI VEO I2V] Generating video from image`);
      console.log(`   Prompt: "${prompt || 'Animate this image'}"`);
      console.log(`   Duration: ${duration}s`);
      console.log(`   Aspect Ratio: ${aspectRatio}`);
      console.log('═'.repeat(60));
      
      // Calculate dimensions
      let width = 1280;
      let height = 720;
      if (aspectRatio === '9:16') {
        width = 720;
        height = 1280;
      } else if (aspectRatio === '1:1') {
        width = 720;
        height = 720;
      }
      
      // Try Gemini Veo with image input
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/veo-001:generateVideo?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt || 'Animate this image',
          image: imageDataUrl, // Include image data
          videoDuration: `${duration}s`,
          aspectRatio: aspectRatio,
          safetySettings: {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const operationId = data.name || data.operationId;
        
        if (operationId) {
          // Poll for completion
          let attempts = 0;
          const maxAttempts = 60;
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const statusResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationId}?key=${apiKey}`, {
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            const statusData = await statusResponse.json();
            
            if (statusData.done) {
              if (statusData.error) {
                console.error('Gemini Veo I2V failed:', statusData.error);
                break;
              }
              
              const videoData = statusData.response?.videoData;
              const videoUrl = videoData?.uri || videoData?.url;
              
              if (videoUrl) {
                console.log('✅ Video generated successfully with Gemini Veo I2V');
                return {
                  url: videoUrl,
                  prompt: prompt || 'Video generated from image',
                  duration: duration,
                  width: width,
                  height: height
                };
              }
            }
            
            attempts++;
          }
        }
      } else {
        const errorText = await response.text();
        console.warn('⚠️ Gemini Veo I2V not supported or failed:', errorText);
      }
    } catch (error) {
      console.error('⚠️ Gemini Veo I2V generation failed:', error);
    }
  }

  // Fallback: Try OpenAI Sora I2V (when available)
  console.log('🔄 Trying OpenAI Sora I2V fallback...');
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (openaiApiKey) {
    try {
      // NOTE: OpenAI Sora I2V is not yet available via API
      // When it becomes available, this will be implemented
      console.warn('⚠️ OpenAI Sora I2V is not yet available via API');
      console.warn('   Waiting for official Sora I2V API release from OpenAI');
    } catch (error) {
      console.error('⚠️ OpenAI Sora I2V generation failed:', error);
    }
  }
  
  // If all methods fail, return null
  console.error('❌ All image-to-video generation methods failed');
  console.error('   - Gemini Veo I2V: Failed (quota exceeded or not supported)');
  console.error('   - OpenAI Sora I2V: Not yet available via API');
  console.error('   Please check API quotas or wait for Sora I2V API release');
  
  return null;
}

// Helper function to upload image to Supabase Storage for RunPod
async function uploadImageToSupabase(imageDataUrl: string): Promise<string | null> {
  try {
    const { supabase } = await import('../lib/supabase.js');
    
    // Extract base64 data
    const matches = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return null;
    }
    
    const [, imageType, base64Data] = matches;
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Generate unique filename
    const fileName = `i2v-${Date.now()}-${Math.random().toString(36).substring(7)}.${imageType}`;
    const filePath = `temp-images/${fileName}`;
    
    // Upload to Supabase Storage (use a temp bucket or existing bucket)
    const { data, error } = await supabase.storage
      .from('generated-media') // Use existing bucket or create 'temp-images' bucket
      .upload(filePath, imageBuffer, {
        contentType: `image/${imageType}`,
        upsert: false
      });
    
    if (error) {
      console.error('Failed to upload image to Supabase:', error);
      return null;
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('generated-media')
      .getPublicUrl(filePath);
    
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error uploading image to Supabase:', error);
    return null;
  }
}


