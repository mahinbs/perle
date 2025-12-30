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


