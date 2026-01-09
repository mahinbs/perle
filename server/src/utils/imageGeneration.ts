// Image generation using Google Gemini Imagen API
// Uses the same Gemini API key you already have - NO EXTRA SETUP NEEDED!

interface GeneratedImage {
  url: string;
  prompt: string;
  width: number;
  height: number;
}

// Check if query needs an image
export function shouldGenerateImage(query: string): boolean {
  const imageKeywords = [
    'image', 'picture', 'photo', 'show me', 'visualize', 'illustration',
    'diagram', 'chart', 'graph', 'drawing', 'sketch', 'render',
    'design', 'create', 'generate', 'make', 'draw', 'paint'
  ];
  
  const lowerQuery = query.toLowerCase();
  return imageKeywords.some(keyword => lowerQuery.includes(keyword));
}

// Extract image prompt from query
export function extractImagePrompt(query: string, answer: string): string | null {
  // Try to extract what user wants to visualize
  const lowerQuery = query.toLowerCase();
  
  // Direct image request patterns
  const patterns = [
    /(?:show me|generate|create|make|draw)(?:\s+(?:a|an|the))?\s+(?:image|picture|photo)?\s*(?:of)?\s+(.+)/i,
    /(?:image|picture|photo)(?:\s+of)?\s+(.+)/i,
    /visualize\s+(.+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // If no explicit request but query is about something visual, use the query itself
  if (shouldGenerateImage(query)) {
    // Clean up query to make a good prompt
    return query
      .replace(/^(what|how|show me|can you|please|generate|create|make|draw|give me)\s+/i, '')
      .replace(/\?$/g, '')
      .trim();
  }
  
  return null;
}

// Generate image using Gemini Imagen API - tries fast model first, then falls back to detailed
export async function generateImageWithGemini(
  prompt: string, 
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '1:1',
  referenceImageDataUrl?: string // Optional reference image for style/content guidance
): Promise<GeneratedImage | null> {
  // Use the same API key as your Gemini chat
  // Always use the free Gemini API key for image generation
  const apiKey = process.env.GEMINI_API_KEY_FREE || process.env.GOOGLE_API_KEY_FREE || process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    console.warn('Google API key not configured. Skipping image generation.');
    return null;
  }
  
  // Try models in order: Gemini 3 Pro Image (with ref support) -> Imagen 4.0 models (fallback)
  const models = [
    { name: 'gemini-3-pro-image-preview', displayName: 'Gemini 3 Pro Image', api: 'gemini', supportsRef: true },
    { name: 'imagen-4.0-fast-generate-001', displayName: 'Imagen 4.0 Fast', api: 'vertex', supportsRef: false },
    { name: 'imagen-4.0-generate-001', displayName: 'Imagen 4.0 Standard', api: 'vertex', supportsRef: false },
    { name: 'imagen-4.0-ultra-generate-001', displayName: 'Imagen 4.0 Ultra', api: 'vertex', supportsRef: false },
  ];
  
  for (const model of models) {
    try {
      console.log('═'.repeat(60));
      console.log(`🎨 [${model.displayName.toUpperCase()}] Generating image`);
      console.log(`   Prompt: "${prompt}"`);
      console.log(`   Aspect Ratio: ${aspectRatio}`);
      if (referenceImageDataUrl && model.supportsRef) {
        console.log(`   📎 Using reference image for style guidance`);
      } else if (referenceImageDataUrl && !model.supportsRef) {
        console.log(`   ⚠️  Reference images not supported, using prompt only`);
      }
      console.log(`   API: ${model.api === 'gemini' ? 'Gemini API' : 'Vertex AI'}`);
      console.log('═'.repeat(60));
      
      let response: Response;
      
      if (model.api === 'gemini') {
        // NEW GEMINI API FORMAT (Gemini 3 Pro Image)
        // Correct structure: contents + generationConfig (not just config)
        const parts: any[] = [{ text: prompt }];
        
        // Add reference image in contents.parts
        if (referenceImageDataUrl) {
          let imageBase64 = referenceImageDataUrl;
          let mimeType = 'image/png';
          
          if (referenceImageDataUrl.startsWith('data:')) {
            const matches = referenceImageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
            if (matches) {
              mimeType = matches[1];
              imageBase64 = matches[2];
            }
          }
          
          parts.push({
            inline_data: {
              mime_type: mimeType,
              data: imageBase64
            }
          });
          
          console.log(`   📷 Reference image added (${(imageBase64.length / 1024).toFixed(1)}KB)`);
        }
        
        const requestBody = {
          contents: [{ parts }],
          generationConfig: { // User provided 'config' but REST API expects 'generationConfig'
            response_modalities: ['IMAGE']
          }
        };
        
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(30000)
        });
      } else {
        // VERTEX AI FORMAT (Imagen 4.0)
        const requestBody: any = {
          instances: [{
            prompt: prompt
          }],
          parameters: {
            sampleCount: 1,
            aspectRatio: aspectRatio,
            safetySetting: 'block_low_and_above'
          }
        };
        
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.name}:predict?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(30000)
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
      
      let imageData: string | undefined;
      
      // Parse response based on API type
      if (model.api === 'gemini') {
        // Gemini API returns inlineData (camelCase), NOT inline_data (snake_case)!
        // Response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "...", data: "..." } }] } }] }
        const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        imageData = part?.inlineData?.data;
      } else {
        // Vertex AI returns: { predictions: [{ bytesBase64Encoded: "..." }] }
        imageData = data.predictions?.[0]?.bytesBase64Encoded;
      }
      
      if (imageData) {
        console.log(`✅ Image generated successfully with ${model.displayName}`);
        return {
          url: `data:image/png;base64,${imageData}`,
          prompt: prompt,
          width: 1024,
          height: 1024
        };
      }
      
      console.warn(`No image data returned from ${model.displayName}`);
      console.warn(`Response structure:`, JSON.stringify(data).substring(0, 200));
      continue;
      
    } catch (error: any) {
      console.error(`Error generating image with ${model.displayName}:`, error?.message || error);
      // Try next model
      continue;
    }
  }
  
  // All Gemini models failed
  console.error('❌ All Gemini Imagen models failed or hit rate limits');
  return null;
}

// Alternative: Use DALL-E 3 if Gemini image generation fails
export async function generateImageWithDALLE(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '1:1'
): Promise<GeneratedImage | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ OpenAI API key not configured. Cannot fallback to DALL-E.');
    return null;
  }
  
  try {
    console.log('═'.repeat(60));
    console.log(`🎨 [OPENAI DALL-E 3] Generating image (FALLBACK)`);
    console.log(`   Prompt: "${prompt}"`);
    console.log(`   Aspect Ratio: ${aspectRatio}`);
    console.log(`   API: https://api.openai.com/v1/images/generations`);
    console.log('═'.repeat(60));
    
    // Map aspect ratios to DALL-E 3 sizes
    let size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024';
    if (aspectRatio === '16:9' || aspectRatio === '4:3') {
      size = '1792x1024'; // Landscape
    } else if (aspectRatio === '9:16' || aspectRatio === '3:4') {
      size = '1024x1792'; // Portrait
    }
    
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'dall-e-3', // Latest DALL-E model
        prompt: prompt,
        n: 1,
        size: size,
        quality: 'hd', // Use HD quality for better results
        style: 'vivid' // More hyper-real and dramatic images
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('DALL-E error:', errorText);
      return null;
    }
    
    const data = await response.json();
    
    if (data.data && data.data[0]?.url) {
      console.log('✅ Image generated successfully with DALL-E 3');
      
      // Calculate dimensions based on size
      let width = 1024;
      let height = 1024;
      if (size === '1792x1024') {
        width = 1792;
        height = 1024;
      } else if (size === '1024x1792') {
        width = 1024;
        height = 1792;
      }
      
      return {
        url: data.data[0].url,
        prompt: prompt,
        width: width,
        height: height
      };
    }
    
    return null;
    
  } catch (error) {
    console.error('Error generating image with DALL-E:', error);
    return null;
  }
}

// Main function - uses Gemini Imagen API with DALL-E 3 fallback
export async function generateImage(
  prompt: string, 
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '1:1',
  referenceImageDataUrl?: string
): Promise<GeneratedImage | null> {
  // Try Gemini Imagen first (you already have the API key!)
  try {
    const geminiImage = await generateImageWithGemini(prompt, aspectRatio, referenceImageDataUrl);
    if (geminiImage) {
      return geminiImage;
    }
  } catch (error) {
    console.warn('⚠️ Gemini image generation failed, trying DALL-E 3 fallback...');
  }
  
  // Fallback to DALL-E 3 if Gemini fails (quota, errors, etc.)
  // Note: DALL-E doesn't support reference images
  console.log('🔄 Using OpenAI DALL-E 3 as fallback for image generation');
  const dalleImage = await generateImageWithDALLE(prompt, aspectRatio);
  return dalleImage;
}

