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

// Generate video using Gemini Veo API - tries fast model first, then falls back to standard
export async function generateVideoWithGemini(
  prompt: string, 
  duration: number = 5,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
  referenceImageDataUrl?: string // Optional reference image for style/content guidance
): Promise<GeneratedVideo | null> {
  // Always use the free Gemini API key for video generation
  const apiKey = process.env.GEMINI_API_KEY_FREE || process.env.GOOGLE_API_KEY_FREE || process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    console.warn('Google API key not configured. Skipping video generation.');
    return null;
  }
  
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
  
  // Try models in order: Veo 3.1 (preview with reference image support)
  const models = [
    { name: 'veo-3.1-generate-preview', displayName: 'Veo 3.1 Preview', api: 'gemini' },
    { name: 'veo-3.0-fast-generate-001', displayName: 'Veo 3.0 Fast', api: 'vertex' },
    { name: 'veo-3.0-generate-001', displayName: 'Veo 3.0 Standard', api: 'vertex' },
  ];
  
  for (const model of models) {
    try {
      console.log('═'.repeat(60));
      console.log(`🎥 [${model.displayName.toUpperCase()}] Generating video`);
      console.log(`   Prompt: "${prompt}"`);
      console.log(`   Duration: ${duration}s`);
      console.log(`   Aspect Ratio: ${aspectRatio}`);
      if (referenceImageDataUrl && model.api === 'gemini') {
        console.log(`   📎 Using reference image for style guidance (Veo 3.1)`);
      }
      console.log(`   API: ${model.api === 'gemini' ? 'Gemini API' : 'Vertex AI'}`);
      console.log('═'.repeat(60));
      
      let response: Response;
      let endpoint: string;

      if (model.api === 'gemini') {
         // Veo 3.1 Preview - Try multiple approaches for reference images
         const instance: any = {
           prompt: prompt
         };
         
         if (referenceImageDataUrl) {
           let imageBase64 = referenceImageDataUrl;
           let mimeType = 'image/jpeg';
           
           if (referenceImageDataUrl.startsWith('data:')) {
             const matches = referenceImageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
             if (matches) {
               mimeType = matches[1];
               imageBase64 = matches[2];
             }
           }
           
           // CORRECT STRUCTURE from official Vertex AI docs:
           // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/use-reference-images-to-guide-video-generation
           instance.referenceImages = [{
             image: {
               bytesBase64Encoded: imageBase64,
               mimeType: mimeType
             },
             referenceType: 'style'  // Can be 'style' or other types
           }];
           
           console.log(`   📷 Reference image added (${(imageBase64.length / 1024).toFixed(1)}KB, type: ${mimeType})`);
         }
         
         const requestBody = {
           instances: [instance]
         };
         
         endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:predictLongRunning?key=${apiKey}`;
         
         console.log(`   🔍 Request payload: ${JSON.stringify(requestBody).substring(0, 300)}...`);
         
         response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(120000)
         });

      } else {
        // VERTEX AI FORMAT - Veo 3.0
        const requestBody: any = {
          instances: [{ prompt: prompt }],
          parameters: {}
        };
        
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:predictLongRunning?key=${apiKey}`;

        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(120000)
        });
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${model.displayName} error (${response.status}):`, errorText);
        
        // Check if it's a rate limit error - if so, try next model
        if (response.status === 429 || errorText.includes('quota') || errorText.includes('rate limit')) {
          console.log(`⚠️ ${model.displayName} rate limit hit, trying next model...`);
          continue;
        }
        
        // For other errors, also try next model
        continue;
      }
      
      const data = await response.json();
      
      console.log(`📋 Response from ${model.displayName}:`, JSON.stringify(data).substring(0, 200));
      
      // Gemini Veo returns an operation ID for async processing
      const operationId = data.name || data.operationId;
      
      if (!operationId) {
        console.error(`❌ No operation ID returned from ${model.displayName}`);
        console.error(`Response keys:`, Object.keys(data));
        continue;
      }
      
      console.log(`✅ Got operation ID: ${operationId}`);
      console.log(`🔄 Starting to poll for video completion...`);
      
      // Poll for video generation completion
      let attempts = 0;
      const maxAttempts = 120; // 2 minutes max wait (video takes longer)
      
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
          console.error(`${model.displayName} generation failed:`, statusData.error);
          // If rate limit error OR internal error, try next model
          if (
            statusData.error.message?.includes('quota') || 
            statusData.error.message?.includes('rate limit') ||
            statusData.error.code === 13 || // Internal server error
            statusData.error.message?.includes('internal server')
          ) {
            console.log(`⚠️ ${model.displayName} error (code ${statusData.error.code}), trying next model...`);
            break;
          }
          return null;
        }
        
        // Extract video URL from response
        // The structure is: response.generateVideoResponse.generatedSamples[0].video.uri
        const videoData = statusData.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
        const videoUrl = videoData?.uri;
          
          if (videoUrl) {
            console.log(`✅ Video generated successfully with ${model.displayName}`);
            console.log(`🎬 Video URL: ${videoUrl}`);
            return {
              url: videoUrl,
              prompt: prompt,
              duration: duration,
              width: width,
              height: height
            };
          } else {
            console.error(`❌ No video URL in response.`);
            console.log(`📦 Response structure:`, JSON.stringify(statusData.response).substring(0, 500));
          }
        }
      }
      
      console.warn(`${model.displayName} generation timed out, trying next model...`);
      continue;
      
    } catch (error: any) {
      console.error(`Error generating video with ${model.displayName}:`, error?.message || error);
      // Try next model
      continue;
    }
  }
  
  // All Gemini models failed
  console.error('❌ All Gemini Veo models failed or hit rate limits');
  return null;
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
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
  referenceImageDataUrl?: string
): Promise<GeneratedVideo | null> {
  // Try Gemini Veo first (with optional reference image)
  try {
    const geminiVideo = await generateVideoWithGemini(prompt, duration, aspectRatio, referenceImageDataUrl);
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

// Generate video from image using Gemini Veo - tries fast model first, then falls back to standard
export async function generateVideoFromImage(
  imageDataUrl: string, // Base64 data URL or image URL
  prompt?: string, // Optional description/prompt
  duration: number = 5,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9'
): Promise<GeneratedVideo | null> {
  const apiKey = process.env.GEMINI_API_KEY_FREE || process.env.GOOGLE_API_KEY_FREE || process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    console.warn('Google API key not configured. Skipping image-to-video generation.');
    return null;
  }
  
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
  
  // Try models in order: fast -> standard (based on your quota)
  // These are the actual available model names from Google AI
  const models = [
    { name: 'veo-3.0-fast-generate-001', displayName: 'Veo 3.0 Fast I2V' },
    { name: 'veo-3.0-generate-001', displayName: 'Veo 3.0 Standard I2V' },
  ];
  
  for (const model of models) {
    try {
      console.log('═'.repeat(60));
      console.log(`🎥 [${model.displayName.toUpperCase()}] Generating video from image`);
      console.log(`   Prompt: "${prompt || 'Animate this image'}"`);
      console.log(`   Duration: ${duration}s`);
      console.log(`   Aspect Ratio: ${aspectRatio}`);
      console.log(`   API: https://generativelanguage.googleapis.com/v1beta/models/${model.name}`);
      console.log('═'.repeat(60));
      
      // Extract base64 data from data URL
      let imageBase64 = imageDataUrl;
      let imageMimeType = 'image/jpeg';
      
      if (imageDataUrl.startsWith('data:')) {
        const matches = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (matches) {
          imageMimeType = matches[1];
          imageBase64 = matches[2];
        }
      }
      
      // Try Gemini Veo with image input (predictLongRunning method)
      const requestBody = {
        instances: [{
          prompt: prompt || 'Animate this image with smooth, natural motion',
          image: {
            bytesBase64Encoded: imageBase64
          }
        }],
        parameters: {}
      };
      
      console.log(`📤 Sending image-to-video request (image size: ${imageBase64.length} chars)`);
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.name}:predictLongRunning?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(120000) // 120 second timeout
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${model.displayName} error (${response.status}):`, errorText);
        
        // Check if it's a rate limit error - if so, try next model
        if (response.status === 429 || errorText.includes('quota') || errorText.includes('rate limit')) {
          console.log(`⚠️ ${model.displayName} rate limit hit, trying next model...`);
          continue;
        }
        
        // For other errors, also try next model
        continue;
      }
      
      const data = await response.json();
      console.log(`📋 Response from ${model.displayName}:`, JSON.stringify(data));
      
      const operationId = data.name || data.operationId;
      
      if (!operationId) {
        console.error(`❌ No operation ID returned from ${model.displayName}`);
        console.error(`Response keys:`, Object.keys(data));
        continue;
      }
      
      console.log(`✅ Got operation ID: ${operationId}`);
      
      // Poll for completion
      let attempts = 0;
      const maxAttempts = 120; // 2 minutes max wait
      
      console.log(`⏳ Polling for video completion (max ${maxAttempts} attempts)...`);
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;
        
        const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationId}?key=${apiKey}`;
        
        const statusResponse = await fetch(pollUrl, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`❌ Polling error (attempt ${attempts}):`, statusResponse.status, errorText.substring(0, 200));
          continue;
        }
        
        const statusData = await statusResponse.json();
        
        // Log progress every 10 attempts
        if (attempts % 10 === 0) {
          console.log(`   Attempt ${attempts}/${maxAttempts} - Status: ${statusData.done ? 'DONE' : 'Processing...'}`);
        }
        
        if (statusData.done) {
          if (statusData.error) {
            console.error(`${model.displayName} generation failed:`, statusData.error);
            // If rate limit error or internal error, try next model
            if (statusData.error.message?.includes('quota') || 
                statusData.error.message?.includes('rate limit') || 
                statusData.error.code === 13) {
              console.log(`⚠️ ${model.displayName} quota/internal error, trying next model...`);
              break;
            }
            return null;
          }
          
          // Extract video URL - same structure as text-to-video
          const videoData = statusData.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
          const videoUrl = videoData?.uri;
          
          if (videoUrl) {
            console.log(`✅ Video generated successfully with ${model.displayName} (from image)`);
            console.log(`🎬 Video URL: ${videoUrl}`);
            return {
              url: videoUrl,
              prompt: prompt || 'Video generated from image',
              duration: duration,
              width: width,
              height: height
            };
          } else {
            console.error(`❌ No video URL in response. Response structure:`, JSON.stringify(statusData.response || {}).substring(0, 500));
          }
        }
      }
      
      console.warn(`${model.displayName} generation timed out, trying next model...`);
      continue;
      
    } catch (error: any) {
      console.error(`Error generating video with ${model.displayName}:`, error?.message || error);
      // Try next model
      continue;
    }
  }
  
  // All Gemini models failed
  console.error('❌ All Gemini Veo I2V models failed or hit rate limits');
  console.error('   - Veo 3.0 Fast I2V: Failed');
  console.error('   - Veo 3.0 Standard I2V: Failed');
  console.error('   Note: OpenAI Sora I2V is not yet available via API');
  
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


