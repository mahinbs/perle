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

// Generate image using Gemini Imagen API
export async function generateImageWithGemini(prompt: string): Promise<GeneratedImage | null> {
  // Use the same API key as your Gemini chat
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_FREE;
  
  if (!apiKey) {
    console.warn('Google API key not configured. Skipping image generation.');
    return null;
  }
  
  try {
    console.log('🎨 Generating image with Gemini Imagen:', prompt);
    
    // Use Gemini's image generation endpoint (Imagen 3)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instances: [{
          prompt: prompt
        }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '1:1', // Square images
          negativePrompt: 'nsfw, ugly, bad quality, blurry, distorted',
          safetySetting: 'block_some'
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini Imagen error:', errorText);
      return null;
    }
    
    const data = await response.json();
    
    // Extract base64 image from response
    const imageData = data.predictions?.[0]?.bytesBase64Encoded;
    
    if (imageData) {
      console.log('✅ Image generated successfully with Gemini');
      return {
        url: `data:image/png;base64,${imageData}`,
        prompt: prompt,
        width: 1024,
        height: 1024
      };
    }
    
    console.warn('No image data returned from Gemini');
    return null;
    
  } catch (error) {
    console.error('Error generating image with Gemini:', error);
    return null;
  }
}

// Alternative: Use DALL-E if Gemini image generation fails
export async function generateImageWithDALLE(prompt: string): Promise<GeneratedImage | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    return null;
  }
  
  try {
    console.log('🎨 Generating image with DALL-E:', prompt);
    
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('DALL-E error:', errorText);
      return null;
    }
    
    const data = await response.json();
    
    if (data.data && data.data[0]?.url) {
      console.log('✅ Image generated with DALL-E');
      return {
        url: data.data[0].url,
        prompt: prompt,
        width: 1024,
        height: 1024
      };
    }
    
    return null;
    
  } catch (error) {
    console.error('Error generating image with DALL-E:', error);
    return null;
  }
}

// Main function - uses Gemini Imagen API (same key as chat)
export async function generateImage(prompt: string): Promise<GeneratedImage | null> {
  // Try Gemini Imagen first (you already have the API key!)
  const geminiImage = await generateImageWithGemini(prompt);
  if (geminiImage) {
    return geminiImage;
  }
  
  // Fallback to DALL-E if Gemini fails and OpenAI key is available
  const dalleImage = await generateImageWithDALLE(prompt);
  return dalleImage;
}

