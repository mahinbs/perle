// Video generation using Google Gemini Veo API with OpenAI fallback

export interface GeneratedVideo {
  url: string;
  prompt: string;
  duration: number;
  width: number;
  height: number;
  /** Gemini File API URI for this video (use as reference for video-to-video / "make it better") */
  fileUri?: string;
}

export class VideoGenerationError extends Error {
  statusCode: number;
  provider: 'gemini' | 'openai' | 'unknown';
  errorCode: string;

  constructor(message: string, statusCode: number, provider: 'gemini' | 'openai' | 'unknown', errorCode: string) {
    super(message);
    this.name = 'VideoGenerationError';
    this.statusCode = statusCode;
    this.provider = provider;
    this.errorCode = errorCode;
  }
}

const BASE_URL = 'https://generativelanguage.googleapis.com';

/**
 * Upload video to Gemini File API and return file_uri for use as reference in video-to-video.
 * Best practice: upload once, pass file_uri in subsequent "make it better" requests.
 */
export async function uploadVideoToGeminiFileAPI(videoBuffer: Buffer): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY_FREE || process.env.GOOGLE_API_KEY_FREE || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  const numBytes = videoBuffer.length;
  const mimeType = 'video/mp4';
  const displayName = 'reference-video.mp4';

  try {
    // Step 1: Start resumable upload, get upload URL
    const startRes = await fetch(`${BASE_URL}/upload/v1beta/files?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(numBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    });
    if (!startRes.ok) {
      console.error('File API start upload failed:', startRes.status, await startRes.text());
      return null;
    }
    const uploadUrl = startRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      console.error('File API: no x-goog-upload-url in response');
      return null;
    }

    // Step 2: Upload bytes
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(numBytes),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: new Uint8Array(videoBuffer),
    });
    if (!uploadRes.ok) {
      console.error('File API upload bytes failed:', uploadRes.status, await uploadRes.text());
      return null;
    }
    const fileInfo = await uploadRes.json();
    const fileUri = fileInfo?.file?.uri ?? fileInfo?.uri;
    const fileName = fileInfo?.file?.name ?? fileInfo?.name;
    if (!fileUri) {
      console.error('File API: no file.uri in response', JSON.stringify(fileInfo).substring(0, 200));
      return null;
    }

    // Step 3: For video, poll until state is ACTIVE
    if (fileName) {
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const getRes = await fetch(`${BASE_URL}/v1beta/${fileName}?key=${apiKey}`);
        if (!getRes.ok) break;
        const getData = await getRes.json();
        const state = getData?.state ?? getData?.file?.state;
        if (state === 'ACTIVE') {
          console.log('✅ Video file ACTIVE on File API, file_uri ready for reference');
          return fileUri;
        }
        if (state === 'FAILED') {
          console.error('File API video processing FAILED');
          return null;
        }
        console.log(`   File API video processing... state=${state}`);
      }
    }
    return fileUri;
  } catch (e: any) {
    console.error('uploadVideoToGeminiFileAPI error:', e?.message || e);
    return null;
  }
}

// Generate video using Gemini Veo API - tries fast model first, then falls back to standard
export async function generateVideoWithGemini(
  prompt: string, 
  duration: number = 5,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
  referenceImageDataUrl?: string, // Optional reference image for style/content guidance
  referenceVideoFileUri?: string  // Optional: file_uri from File API for video-to-video / "make it better"
): Promise<GeneratedVideo | null> {
  let sawRateLimit = false;
  let sawPermissionDenied = false;
  let lastProviderMessage = '';

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
      if (referenceVideoFileUri && model.api === 'gemini') {
        console.log(`   🎬 Using reference VIDEO (file_uri) for video-to-video / extension (Veo 3.1)`);
      }
      console.log(`   API: ${model.api === 'gemini' ? 'Gemini API' : 'Vertex AI'}`);
      console.log('═'.repeat(60));
      
      let response: Response;
      let endpoint: string;

      if (model.api === 'gemini') {
         // Veo 3.1 Preview - reference image and/or reference video (file_uri)
         const instance: any = {
           prompt: prompt
         };
         
         // Reference VIDEO: pass whole video as reference (video-to-video / extension)
         if (referenceVideoFileUri) {
           instance.video = { uri: referenceVideoFileUri };
         }
         
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
        lastProviderMessage = errorText;
        
        // Check if it's a rate limit error - if so, try next model
        if (response.status === 429 || errorText.includes('quota') || errorText.includes('rate limit')) {
          sawRateLimit = true;
          console.log(`⚠️ ${model.displayName} rate limit hit, trying next model...`);
          continue;
        }

        if (response.status === 403 || errorText.includes('PERMISSION_DENIED') || errorText.includes('denied access')) {
          sawPermissionDenied = true;
          console.log(`⚠️ ${model.displayName} permission denied, trying next model...`);
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
          const errorMessage = String(statusData.error.message || '');
          lastProviderMessage = errorMessage || lastProviderMessage;

          if (statusData.error.code === 403 || errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('denied access')) {
            sawPermissionDenied = true;
            console.log(`⚠️ ${model.displayName} permission denied, trying next model...`);
            break;
          }
          // If rate limit error OR internal error, try next model
          if (
            errorMessage.includes('quota') || 
            errorMessage.includes('rate limit') ||
            statusData.error.code === 13 || // Internal server error
            errorMessage.includes('RESOURCE_EXHAUSTED') ||
            errorMessage.includes('internal server')
          ) {
            if (errorMessage.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
              sawRateLimit = true;
            }
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
  if (sawPermissionDenied) {
    throw new VideoGenerationError(
      'Video generation provider denied project access. Please check Google project permissions/billing.',
      403,
      'gemini',
      'PERMISSION_DENIED'
    );
  }

  if (sawRateLimit) {
    throw new VideoGenerationError(
      'Video generation quota exceeded. Please retry in a few minutes.',
      429,
      'gemini',
      'RESOURCE_EXHAUSTED'
    );
  }

  if (lastProviderMessage) {
    throw new VideoGenerationError(
      'Video provider returned an error. Please retry shortly.',
      502,
      'gemini',
      'PROVIDER_ERROR'
    );
  }
  return null;
}

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

  // OpenAI supports specific durations; map requested duration to nearest valid value.
  const supportedSeconds = [4, 8, 12];
  const seconds = supportedSeconds.reduce((closest, value) =>
    Math.abs(value - duration) < Math.abs(closest - duration) ? value : closest
  , supportedSeconds[0]);

  // OpenAI supports portrait/landscape sizes; 1:1 falls back to landscape.
  const size = aspectRatio === '9:16' ? '720x1280' : '1280x720';
  const model = process.env.OPENAI_VIDEO_MODEL || 'sora-2';

  console.log('═'.repeat(60));
  console.log('🎥 [OPENAI SORA] Generating video (fallback)');
  console.log(`   Prompt: "${prompt}"`);
  console.log(`   Duration: ${seconds}s`);
  console.log(`   Size: ${size}`);
  console.log(`   Model: ${model}`);
  console.log('═'.repeat(60));

  const createRes = await fetch('https://api.openai.com/v1/videos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      prompt,
      seconds: String(seconds),
      size
    }),
    signal: AbortSignal.timeout(120000)
  });

  const createText = await createRes.text();
  let createData: any = null;
  try {
    createData = createText ? JSON.parse(createText) : null;
  } catch {
    createData = null;
  }

  if (!createRes.ok) {
    const message = createData?.error?.message || createText || 'OpenAI video creation failed';
    const code = createData?.error?.code || 'OPENAI_VIDEO_CREATE_FAILED';
    throw new VideoGenerationError(message, createRes.status, 'openai', code);
  }

  const videoId = createData?.id as string | undefined;
  if (!videoId) {
    throw new VideoGenerationError('OpenAI did not return a video ID', 502, 'openai', 'OPENAI_VIDEO_ID_MISSING');
  }

  console.log(`✅ OpenAI video job created: ${videoId} (async)`);

  // Return internal marker URL immediately; proxy endpoint will wait for completion and stream content.
  const proxyMarkerUrl = `openai://video/${videoId}`;
  return {
    url: proxyMarkerUrl,
    prompt,
    duration: seconds,
    width: size === '720x1280' ? 720 : 1280,
    height: size === '720x1280' ? 1280 : 720
  };
}

// Main function - Gemini first, OpenAI as fallback
export async function generateVideo(
  prompt: string,
  duration: number = 5,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
  referenceImageDataUrl?: string,
  referenceVideoFileUri?: string // file_uri from File API for video-to-video / "make it better"
): Promise<GeneratedVideo | null> {
  let geminiError: VideoGenerationError | null = null;

  // Try Gemini Veo first (with optional reference image or reference video)
  try {
    const geminiVideo = await generateVideoWithGemini(prompt, duration, aspectRatio, referenceImageDataUrl, referenceVideoFileUri);
    if (geminiVideo) {
      return geminiVideo;
    }
  } catch (error: unknown) {
    if (error instanceof VideoGenerationError) {
      geminiError = error;
      console.warn(`⚠️ Gemini failed (${error.errorCode}), trying OpenAI fallback...`);
    } else {
      console.error('⚠️ Gemini Veo video generation failed:', error);
    }
  }

  // Try OpenAI fallback
  try {
    console.log('🔄 Trying OpenAI fallback...');
    const openaiVideo = await generateVideoWithOpenAI(prompt, duration, aspectRatio);
    if (openaiVideo) {
      return openaiVideo;
    }
  } catch (error: unknown) {
    if (error instanceof VideoGenerationError) {
      throw error;
    }
    console.error('⚠️ OpenAI video generation failed:', error);
  }

  // No video providers available
  console.error('❌ All video generation providers failed or unavailable');
  console.error('   - Gemini Veo: Failed');
  console.error('   - OpenAI Sora: Failed or unavailable');

  if (geminiError) {
    throw geminiError;
  }

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


