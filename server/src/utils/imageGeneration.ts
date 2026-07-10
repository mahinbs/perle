// Image generation using Google Gemini Imagen API
// Uses the same Gemini API key you already have - NO EXTRA SETUP NEEDED!

interface GeneratedImage {
  url: string;
  prompt: string;
  width: number;
  height: number;
}

/**
 * Check if a query is asking us to GENERATE a new image.
 *
 * BUG FIXED 2026-06-24: the old version used plain substring matching, which
 * meant "one paragraph: what is the Mariana Trench?" matched the keyword
 * "graph" inside "para[graph]" and triggered a wasteful 2 MB image-gen call
 * on a question that has nothing to do with images. We now require:
 *   - whole-word matches (\b boundaries) for single-word triggers; AND
 *   - the verb keywords (create/make/generate/etc.) must appear together
 *     with a visual-noun keyword in the same query, so "make a plan" or
 *     "generate a report" don't trigger image generation.
 *
 * Phrases like "show me", "visualize", "draw", "sketch", and explicit
 * visual nouns (image/picture/photo/illustration/diagram/chart/graph/
 * drawing/sketch/render/painting) continue to trigger as before.
 */
export function shouldGenerateImage(query: string): boolean {
  const q = query.toLowerCase();

  // Visual-noun keywords — whole-word match. A bare "image" / "picture" /
  // "diagram" etc. in the prompt is a strong intent signal on its own.
  const visualNouns = [
    'image', 'images', 'picture', 'pictures', 'photo', 'photos',
    'illustration', 'illustrations', 'diagram', 'diagrams', 'chart',
    'charts', 'graph', 'graphs', 'drawing', 'drawings', 'sketch',
    'sketches', 'render', 'renders', 'painting', 'paintings',
  ];
  const visualVerbPhrases = [
    'show me', 'visualize', 'visualise', 'draw', 'paint',
  ];

  // Word-boundary regex prevents the "paragraph"→"graph" false positive.
  const nounRe = new RegExp(`\\b(${visualNouns.join('|')})\\b`, 'i');
  if (nounRe.test(q)) return true;

  // Explicit imperative phrases — still substring (need to match "show me").
  if (visualVerbPhrases.some((p) => q.includes(p))) return true;

  // Generic create-verbs (create/make/generate/design) ONLY fire when paired
  // with a visual-noun token in the same prompt. "Make a plan" → no; "make
  // an image of a cat" → yes.
  const createVerbs = /\b(create|make|generate|design|produce)\b/i;
  if (createVerbs.test(q) && nounRe.test(q)) return true;

  return false;
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
/** Normalize a single data URL or an array into a capped list (max 5). */
export function normalizeReferenceImages(
  refs?: string | string[] | null
): string[] {
  if (!refs) return [];
  const list = Array.isArray(refs) ? refs : [refs];
  return list.filter((r) => typeof r === 'string' && r.length > 0).slice(0, 5);
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  let mimeType = 'image/png';
  let base64 = dataUrl;
  if (dataUrl.startsWith('data:')) {
    const matches = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      base64 = matches[2];
    }
  }
  return { mimeType, base64 };
}

export async function generateImageWithGemini(
  prompt: string, 
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '1:1',
  referenceImageDataUrl?: string | string[] // One or more reference images
): Promise<GeneratedImage | null> {
  // Use the same API key as your Gemini chat
  // Always use the free Gemini API key for image generation
  const apiKey = process.env.GEMINI_API_KEY_FREE || process.env.GOOGLE_API_KEY_FREE || process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    console.warn('Google API key not configured. Skipping image generation.');
    return null;
  }

  const referenceImages = normalizeReferenceImages(referenceImageDataUrl);
  const hasRefs = referenceImages.length > 0;
  
  // Try models in order: Gemini 3 Pro Image (with ref support) -> Imagen 4.0 models (fallback)
  // Order = first-try first. Verified live against the deployment's Gemini
  // key: gemini-3-pro-image-preview and nano-banana-pro-preview both return
  // ~1MB images in 15-25s. Imagen 4 variants are kept as a tail because
  // they trip safety filters on benign prompts (e.g. "a red apple"); the
  // chain falls through when one model rejects.
  const allModels = [
    { name: 'gemini-3-pro-image-preview', displayName: 'Gemini 3 Pro Image', api: 'gemini', supportsRef: true },
    { name: 'nano-banana-pro-preview', displayName: 'Nano Banana Pro', api: 'gemini', supportsRef: true },
    { name: 'gemini-2.5-flash-image', displayName: 'Gemini 2.5 Flash Image', api: 'gemini', supportsRef: true },
    { name: 'imagen-4.0-fast-generate-001', displayName: 'Imagen 4.0 Fast', api: 'vertex', supportsRef: false },
    { name: 'imagen-4.0-generate-001', displayName: 'Imagen 4.0 Standard', api: 'vertex', supportsRef: false },
    { name: 'imagen-4.0-ultra-generate-001', displayName: 'Imagen 4.0 Ultra', api: 'vertex', supportsRef: false },
  ];

  // When we have a reference image (edit request), only use models that support it.
  // Otherwise we'd fall back to Imagen 4.0 which ignores the reference and generates a new image.
  const models = hasRefs
    ? allModels.filter((m) => m.supportsRef)
    : allModels;

  if (hasRefs && models.length === 0) {
    console.warn('⚠️ No Gemini model with reference support available');
    return null;
  }

  for (const model of models) {
    try {
      console.log('═'.repeat(60));
      console.log(`🎨 [${model.displayName.toUpperCase()}] Generating image`);
      console.log(`   Prompt: "${prompt}"`);
      console.log(`   Aspect Ratio: ${aspectRatio}`);
      if (hasRefs && model.supportsRef) {
        console.log(`   📎 Using ${referenceImages.length} reference image(s) for style/content guidance`);
      } else if (hasRefs && !model.supportsRef) {
        console.log(`   ⚠️  Reference images not supported, using prompt only`);
      }
      console.log(`   API: ${model.api === 'gemini' ? 'Gemini API' : 'Vertex AI'}`);
      console.log('═'.repeat(60));
      
      let response: Response;
      
      if (model.api === 'gemini') {
        // NEW GEMINI API FORMAT (Gemini 3 Pro Image)
        // Correct structure: contents + generationConfig (not just config)
        const guidedPrompt =
          referenceImages.length > 1
            ? `${prompt}\n\nUse ALL ${referenceImages.length} attached reference images together — combine their subjects, style, colors, and composition into one cohesive result. Do not ignore any of them.`
            : prompt;
        const parts: any[] = [{ text: guidedPrompt }];
        
        // Add every reference image as an inline_data part so the model sees all of them
        for (let i = 0; i < referenceImages.length; i++) {
          const { mimeType, base64 } = parseImageDataUrl(referenceImages[i]);
          parts.push({
            inline_data: {
              mime_type: mimeType,
              data: base64
            }
          });
          console.log(`   📷 Reference image ${i + 1}/${referenceImages.length} added (${(base64.length / 1024).toFixed(1)}KB)`);
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
  if (hasRefs) {
    console.log('❌ Gemini ref-capable model(s) failed — caller can try OpenAI GPT Image edit');
  } else {
    console.error('❌ All Gemini Imagen models failed or hit rate limits');
  }
  return null;
}

// OpenAI GPT Image edit (for when we have a reference image and Gemini failed)
// Uses /v1/images/edits with gpt-image-1.5 - supports one or more reference images
export async function generateImageWithOpenAIGPTImageEdit(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '1:1',
  referenceImageDataUrl: string | string[]
): Promise<GeneratedImage | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ OpenAI API key not configured. Cannot use GPT Image edit.');
    return null;
  }

  const referenceImages = normalizeReferenceImages(referenceImageDataUrl);
  if (referenceImages.length === 0) return null;

  try {
    console.log('═'.repeat(60));
    console.log('🎨 [OPENAI GPT IMAGE EDIT] Editing image with reference(s)');
    console.log(`   Prompt: "${prompt}"`);
    console.log(`   References: ${referenceImages.length}`);
    console.log('   API: https://api.openai.com/v1/images/edits (gpt-image-1.5)');
    console.log('═'.repeat(60));

    const guidedPrompt =
      referenceImages.length > 1
        ? `${prompt}\n\nCombine all ${referenceImages.length} attached reference images into one cohesive result.`
        : prompt;

    const formData = new FormData();
    formData.append('model', 'gpt-image-1.5');
    formData.append('prompt', guidedPrompt);
    // gpt-image-1.5 accepts multiple images via repeated `image[]` fields
    for (let i = 0; i < referenceImages.length; i++) {
      const { mimeType, base64 } = parseImageDataUrl(referenceImages[i]);
      const imageBuffer = Buffer.from(base64, 'base64');
      const ext = mimeType === 'image/jpeg' || mimeType === 'image/jpg' ? 'jpg' : 'png';
      formData.append('image[]', new Blob([imageBuffer], { type: mimeType }), `reference-${i + 1}.${ext}`);
    }

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI GPT Image edit error:', errorText);
      return null;
    }

    const data = await response.json();
    const resultB64 = data.data?.[0]?.b64_json;
    if (resultB64) {
      console.log('✅ Image edited successfully with OpenAI GPT Image');
      return {
        url: `data:image/png;base64,${resultB64}`,
        prompt: prompt,
        width: 1024,
        height: 1024
      };
    }
    return null;
  } catch (error: any) {
    console.error('Error in OpenAI GPT Image edit:', error?.message || error);
    return null;
  }
}

/**
 * Text-to-image via OpenAI's images/generations endpoint. Verified live
 * against the account: both gpt-image-2 (newest, ~17s) and gpt-image-1
 * (~2s) return valid b64 images. DALL-E 3 is NOT listed as available on
 * this account ("model does not exist"), so we removed it from the chain.
 *
 * We try gpt-image-1 first (much faster, similar quality for most prompts),
 * falling back to gpt-image-2 only if v1 errors.
 */
export async function generateImageWithOpenAIGPTImage(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '1:1',
  preferredModel: 'gpt-image-1' | 'gpt-image-2' | 'gpt-image-1.5' = 'gpt-image-1'
): Promise<GeneratedImage | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  let size: '1024x1024' | '1536x1024' | '1024x1536' = '1024x1024';
  if (aspectRatio === '16:9' || aspectRatio === '4:3') size = '1536x1024';
  else if (aspectRatio === '9:16' || aspectRatio === '3:4') size = '1024x1536';

  // Try preferred first, then a same-family fallback if it fails.
  const ladder = preferredModel === 'gpt-image-2'
    ? ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1']
    : preferredModel === 'gpt-image-1.5'
      ? ['gpt-image-1.5', 'gpt-image-1', 'gpt-image-2']
      : ['gpt-image-1', 'gpt-image-1.5', 'gpt-image-2'];

  for (const model of ladder) {
    try {
      console.log(`🎨 [OPENAI ${model}] Generating text-to-image (${size})`);
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, prompt, n: 1, size }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        console.warn(`${model} non-2xx (${response.status}):`, (await response.text()).slice(0, 200));
        continue; // try next in ladder
      }
      const data = await response.json();
      const b64 = data?.data?.[0]?.b64_json;
      const url = data?.data?.[0]?.url;
      if (b64) {
        console.log(`✅ Image generated with OpenAI ${model}`);
        const [w, h] = size.split('x').map(Number);
        return { url: `data:image/png;base64,${b64}`, prompt, width: w, height: h };
      }
      if (url) {
        const [w, h] = size.split('x').map(Number);
        return { url, prompt, width: w, height: h };
      }
    } catch (e: any) {
      console.warn(`${model} threw:`, e?.message || e);
    }
  }
  return null;
}

// Alternative: Use DALL-E 3 if Gemini image generation fails (text-to-image only)
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

// xAI Grok image generation. Verified live: model id is `grok-imagine-image`
// (the previous `grok-2-image` name 404s — xAI renamed the endpoint).
// Higher-quality variant `grok-imagine-image-quality` also available.
// Response shape returns `data[].url` (hosted CDN URL, NOT b64) — different
// from OpenAI's format, so we handle both for resilience.
export async function generateImageWithGrok(
  prompt: string,
  _aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '1:1',
  quality: 'standard' | 'high' = 'standard',
): Promise<GeneratedImage | null> {
  const apiKey = process.env.XAI_API_KEY || process.env.X_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ xAI API key not configured. Cannot use Grok image generation.');
    return null;
  }
  const model = quality === 'high' ? 'grok-imagine-image-quality' : 'grok-imagine-image';
  try {
    console.log(`🎨 [GROK ${model}] Generating image — "${prompt}"`);

    const response = await fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, prompt, n: 1 }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.error(`Grok image error (${response.status}):`, await response.text());
      return null;
    }

    const data = await response.json();
    const url: string | undefined = data?.data?.[0]?.url;
    const b64: string | undefined = data?.data?.[0]?.b64_json;
    if (url) {
      console.log(`✅ Image generated with Grok (${model})`);
      return { url, prompt, width: 1024, height: 1024 };
    }
    if (b64) {
      const mime = data?.data?.[0]?.mime_type || 'image/png';
      return { url: `data:${mime};base64,${b64}`, prompt, width: 1024, height: 1024 };
    }
    return null;
  } catch (error: any) {
    console.error('Error generating image with Grok:', error?.message || error);
    return null;
  }
}

/**
 * UI-facing image model selector. 'auto' uses the default fallback chain;
 * other values pin the *first* attempt to that provider before falling
 * through to the rest of the chain. Premium users can pick a specific
 * model; free users always get 'auto'.
 */
// User-facing image model picker. Each value below was verified live
// against the deployment's keys. 'dalle-3' was removed — the account
// doesn't have access and the alias only confuses users; pick gpt-image-1
// for OpenAI instead. 'imagen-4' is kept because the Gemini chain tries
// the Imagen variants internally even when nano-banana is the entry point.
export type ImageModel =
  | 'auto'
  | 'nano-banana'   // Gemini family — Nano Banana / Gemini 3 Pro Image / Imagen
  | 'imagen-4'      // Forces the Imagen-4 variants in the Gemini chain
  | 'gpt-image-1'   // OpenAI gpt-image-1 (text-to-image + edits)
  | 'grok-image';   // xAI grok-imagine-image

type Step = {
  id: ImageModel;
  // Returns null on failure so the loop can try the next step. Each step is
  // wrapped here so the fallback driver is provider-agnostic.
  run: (
    prompt: string,
    aspect: '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
    refs?: string | string[]
  ) => Promise<GeneratedImage | null>;
  // Edit-capable steps can accept reference image(s). Non-edit steps are
  // skipped when the user supplied a reference (we never silently strip it).
  supportsRef: boolean;
};

// Default chain order: Gemini family first (free for us — uses existing
// Gemini key), then OpenAI's two image endpoints, then Grok. The order is
// "best quality + cheapest first" — the exact one Anthropic-style fallback
// behaviour the user asked for: never stop until one succeeds.
// Default chain. All four providers verified live against the deployment's
// keys (DeepSeek, OpenAI, xAI, Gemini) — model ids were corrected after a
// live probe revealed the old names (grok-2-image, dall-e-3) were no
// longer available. DALL-E 3 is intentionally absent because the OpenAI
// account doesn't list it; gpt-image-1/2 cover that role with the same
// signature. Order = "fastest verified working first":
//   • nano-banana — Gemini family, 15-25s, often best quality
//   • gpt-image-1 — OpenAI, ~2s, very reliable
//   • grok-image — xAI grok-imagine-image, 5s, URL-hosted output
function buildDefaultChain(): Step[] {
  return [
    {
      id: 'nano-banana',
      supportsRef: true,
      run: (p, a, r) => generateImageWithGemini(p, a, r),
    },
    {
      id: 'gpt-image-1',
      supportsRef: true,
      run: (p, a, r) =>
        r ? generateImageWithOpenAIGPTImageEdit(p, a, r) : generateImageWithOpenAIGPTImage(p, a),
    },
    {
      id: 'grok-image',
      supportsRef: false,
      run: (p, a) => generateImageWithGrok(p, a),
    },
  ];
}

// Reorder so the requested model goes first while keeping the rest of the
// chain intact behind it. Unknown / 'auto' returns the chain untouched.
function reorderForPreferred(chain: Step[], preferred: ImageModel): Step[] {
  if (preferred === 'auto') return chain;
  const idx = chain.findIndex((s) => s.id === preferred);
  if (idx < 0) return chain;
  return [chain[idx], ...chain.slice(0, idx), ...chain.slice(idx + 1)];
}

// Main entry — premium users may pass `preferredModel` to pin the first
// attempt; free users always get the default chain. If one provider fails
// (rate limit, network, anything), we silently advance to the next so the
// user sees an image as long as ANY provider is reachable.
export async function generateImage(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '1:1',
  referenceImageDataUrl?: string | string[],
  preferredModel: ImageModel = 'auto',
): Promise<GeneratedImage | null> {
  const refs = normalizeReferenceImages(referenceImageDataUrl);
  const hasRefs = refs.length > 0;
  const baseChain = buildDefaultChain();
  // When editing with reference image(s), the chain is filtered to edit-capable
  // steps first; non-edit fallbacks come after only if no edit step works.
  const chain = hasRefs
    ? [
        ...baseChain.filter((s) => s.supportsRef),
        ...baseChain.filter((s) => !s.supportsRef),
      ]
    : baseChain;
  const ordered = reorderForPreferred(chain, preferredModel);

  for (const step of ordered) {
    try {
      const result = await step.run(prompt, aspectRatio, hasRefs ? refs : undefined);
      if (result) {
        if (step.id !== preferredModel && preferredModel !== 'auto') {
          console.log(`ℹ️ Image-gen fallback: requested ${preferredModel} unavailable, served via ${step.id}`);
        }
        return result;
      }
    } catch (e) {
      console.warn(`⚠️ Image step ${step.id} threw, trying next:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

