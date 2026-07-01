import { supabase } from '../lib/supabase.js';

/**
 * Check if a prompt is asking to edit/modify existing media
 * Uses both keyword matching AND contextual analysis
 * 
 * @param prompt - The current prompt from the user
 * @param lastGeneratedPrompt - Optional: the prompt used to generate the previous image (for context)
 */
export function isEditRequest(prompt: string, lastGeneratedPrompt?: string): boolean {
  const lowerPrompt = prompt.toLowerCase().trim();
  
  // 1. Strong edit indicators - if ANY of these match, it's definitely an edit
  const strongEditKeywords = [
    // Direct references to existing media
    'this image', 'that image', 'the image', 'this video', 'that video', 'the video',
    'previous', 'last one', 'last image', 'last video', 'above image', 'above video',
    
    // Explicit edit commands
    'edit this', 'edit it', 'change this', 'change it', 'modify this', 'modify it',
    'update this', 'update it', 'alter this', 'alter it', 'fix this', 'fix it',
    
    // Continuation phrases
    'same but', 'similar but', 'like the last', 'like before', 'keep it but',
    'keep the', 'keep this', 'instead of', 'insted of', // common typo
  ];
  
  if (strongEditKeywords.some(keyword => lowerPrompt.includes(keyword))) {
    return true;
  }
  
  // 2. Moderate edit indicators - combined with context
  const moderateEditKeywords = [
    // Quality improvements
    'improve', 'enhance', 'better', 'make better', 'look better',
    'upgrade', 'optimize', 'refine', 'polish',
    
    // Transformations (when used without "create" or "generate")
    'make it', 'make the', 'turn it', 'turn the', 'convert it', 'convert the',
    
    // Additions/Removals to existing thing
    'add to', 'add more', 'remove from', 'remove the', 'replace the',
    'put in', 'take out',
    
    // Adjustments
    'more', 'less', 'bigger', 'smaller', 'brighter', 'darker',
    'lighter', 'heavier', 'sharper', 'softer', 'clearer',
    
    // Redo commands
    'redo', 'remake', 'recreate', 'regenerate', 'rework', 'again',
    
    // Common continuation words
    'now', 'also', 'and', 'but', 'however'
  ];
  
  const hasModerateKeyword = moderateEditKeywords.some(keyword => lowerPrompt.includes(keyword));
  
  // 3. Strong "new creation" indicators - these override edit detection
  const newCreationKeywords = [
    'generate a', 'generate an', 'generate image',
    'create a', 'create an', 'create new',
    'make a', 'make an', 'make new',
    'show me a', 'show me an',
    'draw a', 'draw an',
    'design a', 'design an',
  ];
  
  const isNewCreation = newCreationKeywords.some(keyword => lowerPrompt.includes(keyword));
  
  // If explicitly asking for new creation, not an edit
  if (isNewCreation) {
    return false;
  }
  
  // 4. CONVERSATION CONTEXT: Ultra-wide detection for implicit continuations
  // Handles cases like:
  //   "create lion on mountain" → "remove the mountain" ✅
  //   "logo with ABC text" → "ABC in black" ✅
  //   "robot holding sword" → "make sword golden" ✅
  if (lastGeneratedPrompt) {
    const stopWords = new Set([
      // Articles, prepositions, conjunctions
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by',
      // Common verbs (but NOT edit verbs)
      'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
      // Creation keywords (already filtered)
      'create', 'generate', 'make', 'show', 'draw', 'design',
      // Generic words
      'image', 'picture', 'photo', 'video', 'where', 'that', 'this', 'there', 'here', 'what', 'when',
      'very', 'much', 'more', 'some', 'any', 'all', 'can', 'will', 'would', 'should', 'could'
    ]);
    
    // Extract meaningful words from BOTH prompts (nouns, adjectives, proper nouns)
    const extractKeywords = (text: string) => 
      text.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w)); // Meaningful words only
    
    const lastKeywords = extractKeywords(lastGeneratedPrompt);
    const currentKeywords = extractKeywords(prompt);
    
    // Find overlapping terms (subjects, objects, concepts)
    const sharedTerms = lastKeywords.filter(word => 
      currentKeywords.includes(word)
    );
    
    // RULE 1: Multiple shared terms = conversation continuation
    if (sharedTerms.length >= 2) {
      console.log(`🔗 Conversation continuation: "${prompt}" shares [${sharedTerms.join(', ')}] with previous`);
      return true;
    }
    
    // RULE 2: Very short prompt (≤ 10 words) + 1 shared term = likely an edit instruction
    const wordCount = prompt.trim().split(/\s+/).length;
    if (wordCount <= 10 && sharedTerms.length >= 1) {
      console.log(`🔗 Short instruction: "${prompt}" references "${sharedTerms[0]}" from previous (${wordCount} words)`);
      return true;
    }
    
    // RULE 3: Starts with action verb + any shared term = edit command
    // Images: "remove the mountain", "change lion color", "add more trees"
    // Videos: "speed up the video", "trim the end", "add music", "loop it"
    const actionStartsEdit = /^(remove|delete|add|change|replace|swap|move|shift|rotate|flip|resize|scale|speed|slow|trim|cut|crop|extend|loop|reverse|mute|unmute|zoom|pan|fade|transition)/i;
    if (actionStartsEdit.test(prompt) && sharedTerms.length >= 1) {
      console.log(`🔗 Action on previous element: "${prompt}" (acting on: ${sharedTerms[0]})`);
      return true;
    }
    
    // RULE 4: Modifying descriptions of previous subjects
    // Images: "make it darker", "change color to blue", "in black and gold"
    // Videos: "make it faster", "extend to 10 seconds", "add background music"
    const modificationPatterns = [
      /^(make|turn|set|put|get|extend|shorten)/i,
      /^(color|colour|size|position|background|foreground|style|font|text|duration|length|speed|tempo|volume|audio|sound|music)/i,
      /(darker|lighter|bigger|smaller|brighter|taller|wider|thicker|faster|slower|longer|shorter|louder|quieter)/i,
    ];
    const hasModificationIntent = modificationPatterns.some(pattern => pattern.test(prompt));
    
    if (hasModificationIntent && (sharedTerms.length >= 1 || wordCount <= 12)) {
      console.log(`🔗 Modification instruction: "${prompt}" (likely editing previous)`);
      return true;
    }
    
    // RULE 5: Single-word or two-word commands are almost always edits
    // "darker", "remove mountain", "blue background"
    if (wordCount <= 3 && currentKeywords.length >= 1) {
      console.log(`🔗 Ultra-short command: "${prompt}" (${wordCount} words - assuming edit)`);
      return true;
    }
    
    // RULE 6: Pronoun references without explicit "create new" = edit
    // "it should be blue", "make them golden", "change its position"
    const pronounPattern = /(^|\s)(it|its|them|their|that|those)(\s|$)/i;
    if (pronounPattern.test(prompt)) {
      console.log(`🔗 Pronoun reference: "${prompt}" refers to previous context`);
      return true;
    }
    
    // RULE 7: Color/style/timing changes without "create" = editing previous
    // Images: "in black color", "with gold background", "blue and red"
    // Videos: "5 seconds", "with music", "in slow motion", "loop 3 times"
    const colorWords = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'gold', 'silver', 
                        'orange', 'purple', 'pink', 'brown', 'gray', 'grey', 'cyan', 'magenta',
                        'dark', 'light', 'bright', 'transparent', 'opaque'];
    const styleWords = ['color', 'colour', 'background', 'foreground', 'style', 'font', 
                        'texture', 'gradient', 'shadow', 'glow', 'effect'];
    const videoWords = ['seconds', 'second', 'duration', 'speed', 'slow', 'fast', 'motion',
                        'loop', 'repeat', 'music', 'audio', 'sound', 'volume', 'mute',
                        'fps', 'framerate', 'smooth', 'cinematic', 'zoom', 'pan'];
    
    const hasColorOrStyle = [...colorWords, ...styleWords, ...videoWords].some(word => lowerPrompt.includes(word));
    
    if (hasColorOrStyle && !isNewCreation && wordCount <= 15) {
      console.log(`🔗 Color/style/timing change: "${prompt}" (likely modifying previous media)`);
      return true;
    }
    
    // RULE 8: Comparative/incremental changes = editing
    // Images: "more detailed", "less bright", "slightly darker", "a bit bigger"
    // Videos: "faster", "longer", "smoother", "twice as long"
    const comparativePattern = /(more|less|slightly|bit|little|much|very|too|enough|better|worse|faster|slower|longer|shorter|smoother|twice|half|double)/i;
    if (comparativePattern.test(prompt) && wordCount <= 12) {
      console.log(`🔗 Incremental change: "${prompt}" (comparative adjustment)`);
      return true;
    }
    
    // RULE 9: Negations/corrections = editing
    // Images: "not dark", "without mountain", "no background", "don't show text"
    // Videos: "no sound", "mute audio", "remove watermark", "cut the ending"
    const negationPattern = /(not|no|without|dont|don't|remove|delete|hide|exclude|mute|silence|cut|trim)/i;
    if (negationPattern.test(prompt) && (sharedTerms.length >= 1 || wordCount <= 10)) {
      console.log(`🔗 Negation/removal: "${prompt}" (removing/changing previous element)`);
      return true;
    }
    
    // RULE 10: "Just [description]" or prepositional phrases = style edit
    // Images: "just the lion", "in portrait mode", "with better lighting", "without text"
    // Videos: "in slow motion", "with background music", "at 2x speed"
    const justOrPrepPattern = /^(just|only|with|without|in|on|at|using|via)/i;
    if (justOrPrepPattern.test(prompt) && wordCount <= 8) {
      console.log(`🔗 Prepositional/filter phrase: "${prompt}" (modifying previous)`);
      return true;
    }
    
    // RULE 10.5: Numeric timing changes (VIDEO-SPECIFIC)
    // "5 seconds", "10s", "2x speed", "extend to 8 seconds", "make it 15 seconds long"
    const numericTimingPattern = /(\d+\s*(second|seconds|sec|s|minute|minutes|min|m))|(\d+x\s*speed)|(extend|make|set|change).*(to|into)\s*\d+/i;
    if (numericTimingPattern.test(prompt) && wordCount <= 10) {
      console.log(`🔗 Numeric timing change: "${prompt}" (adjusting video duration/speed)`);
      return true;
    }
    
    // RULE 11: Partial word matching for typos (e.g., "mountian" ≈ "mountain")
    // If current prompt has words that are 80%+ similar to previous words
    const similarityThreshold = 0.75;
    const levenshteinDistance = (a: string, b: string): number => {
      if (a.length === 0) return b.length;
      if (b.length === 0) return a.length;
      const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
      for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
      for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
          matrix[j][i] = Math.min(
            matrix[j][i - 1] + 1,
            matrix[j - 1][i] + 1,
            matrix[j - 1][i - 1] + indicator
          );
        }
      }
      return matrix[b.length][a.length];
    };
    
    for (const currentWord of currentKeywords) {
      for (const lastWord of lastKeywords) {
        if (currentWord.length >= 4 && lastWord.length >= 4) {
          const maxLen = Math.max(currentWord.length, lastWord.length);
          const distance = levenshteinDistance(currentWord, lastWord);
          const similarity = 1 - (distance / maxLen);
          
          if (similarity >= similarityThreshold && similarity < 1.0) {
            console.log(`🔗 Fuzzy match: "${currentWord}" ≈ "${lastWord}" (${(similarity * 100).toFixed(0)}% similar)`);
            return true;
          }
        }
      }
    }
  }
  
  // Otherwise, moderate keywords indicate edit
  return hasModerateKeyword;
}

/**
 * Get the most recent generated image for a user (optionally within a conversation)
 */
export async function getLastGeneratedImage(userId: string, conversationId?: string | null): Promise<{url: string; prompt: string} | null> {
  try {
    // Build query for conversation_history
    let query = supabase
      .from('conversation_history')
      .select('generated_image_url, media_prompt')
      .eq('user_id', userId)
      .not('generated_image_url', 'is', null);
    
    // If conversation_id provided, prioritize images from that conversation
    if (conversationId) {
      const { data: conversationData } = await query
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (conversationData && conversationData.generated_image_url) {
        console.log(`📸 Found last generated image in current conversation (${conversationId.substring(0, 8)}...)`);
        return {
          url: conversationData.generated_image_url,
          prompt: conversationData.media_prompt || ''
        };
      }
    }
    
    // If not found in conversation or no conversation_id, get most recent across all conversations
    const { data: historyData } = await supabase
      .from('conversation_history')
      .select('generated_image_url, media_prompt')
      .eq('user_id', userId)
      .not('generated_image_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (historyData && historyData.generated_image_url) {
      console.log('📸 Found last generated image in conversation history (any conversation)');
      return {
        url: historyData.generated_image_url,
        prompt: historyData.media_prompt || ''
      };
    }
    
    // Fallback to generated_media table
    const { data: mediaData } = await supabase
      .from('generated_media')
      .select('url, prompt')
      .eq('user_id', userId)
      .eq('media_type', 'image')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (mediaData) {
      console.log('📸 Found last generated image in generated_media table');
      return {
        url: mediaData.url,
        prompt: mediaData.prompt || ''
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching last generated image:', error);
    return null;
  }
}

/**
 * Get the most recent generated video for a user (optionally within a conversation)
 */
export async function getLastGeneratedVideo(userId: string, conversationId?: string | null): Promise<{url: string; prompt: string; metadata?: Record<string, unknown> | null} | null> {
  try {
    // Prefer generated_media (has metadata.gemini_file_uri for video-to-video reference)
    const { data: mediaData } = await supabase
      .from('generated_media')
      .select('url, prompt, metadata')
      .eq('user_id', userId)
      .eq('media_type', 'video')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (mediaData) {
      console.log('🎥 Found last generated video in generated_media table');
      return { url: mediaData.url, prompt: mediaData.prompt || '', metadata: mediaData.metadata as Record<string, unknown> | null };
    }
    // Fallback: conversation_history
    let query = supabase
      .from('conversation_history')
      .select('generated_video_url, media_prompt')
      .eq('user_id', userId)
      .not('generated_video_url', 'is', null);
    
    // If conversation_id provided, prioritize videos from that conversation
    if (conversationId) {
      const { data: conversationData } = await query
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (conversationData && conversationData.generated_video_url) {
        console.log(`🎥 Found last generated video in current conversation (${conversationId.substring(0, 8)}...)`);
        return {
          url: conversationData.generated_video_url,
          prompt: conversationData.media_prompt || ''
        };
      }
    }
    
    // If not found in conversation or no conversation_id, get most recent across all conversations
    const { data: historyData } = await supabase
      .from('conversation_history')
      .select('generated_video_url, media_prompt')
      .eq('user_id', userId)
      .not('generated_video_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (historyData && historyData.generated_video_url) {
      console.log('🎥 Found last generated video in conversation history (any conversation)');
      return {
        url: historyData.generated_video_url,
        prompt: historyData.media_prompt || ''
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching last generated video:', error);
    return null;
  }
}

/**
 * Save generated media to conversation history
 */
export async function saveMediaToConversationHistory(
  userId: string,
  imageUrl: string | null,
  videoUrl: string | null,
  prompt: string,
  chatMode: string = 'normal',
  conversationId?: string | null
): Promise<void> {
  try {
    const insertData: any = {
      user_id: userId,
      query: prompt,
      answer: imageUrl ? 'Generated image' : 'Generated video',
      mode: 'Ask',
      model: 'gemini-lite',
      chat_mode: chatMode,
      generated_image_url: imageUrl,
      generated_video_url: videoUrl,
      media_prompt: prompt,
      conversation_id: conversationId || null
    };
    
    const { error } = await supabase
      .from('conversation_history')
      .insert(insertData);
    
    if (error) {
      console.error('Failed to save media to conversation history:', error);
    } else {
      console.log(`✅ Media saved to conversation history${conversationId ? ' (conversation: ' + conversationId.substring(0, 8) + '...)' : ''} for future editing context`);
    }
  } catch (error) {
    console.error('Error saving media to conversation history:', error);
  }
}

// ── Smart edit-vs-create intent classification ────────────────────────────
//
// The keyword-only `isEditRequest` above misfires on phrasings like
// "create a brighter version" (classified as new creation because of the
// "create a" override) when the user clearly means EDIT, or "make a forest
// scene" after a robot image (classified as edit by the "make" verb when
// the user actually wants a new image). To fix this without breaking the
// fast path, we add an LLM-backed classifier that ONLY runs when the
// keyword pass is uncertain.
//
//   1. Hard "definitely edit" signals (pronouns to prior, explicit
//      "edit"/"change this") → edit, no LLM call.
//   2. Hard "definitely create" signals (totally different subject, very
//      long detailed prompt) → create, no LLM call.
//   3. Anything else → tiny gemini-lite call (~300ms, ~$0.0001) returns a
//      single token EDIT or CREATE.
//   4. LLM timeout/failure → default to EDIT when a previous image exists,
//      since "treat it as a continuation" is the recoverable mistake; the
//      user can always say "no, fresh image of X" next turn. The opposite
//      mistake (treating an edit as a new image) loses the source image
//      and forces the user to re-upload.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getApiKey } from './apiKeys.js';

function _withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

export type ImageIntent = 'edit' | 'create';

// Decision cache keyed on "<lastPrompt>||<currentPrompt>". Short TTL because
// the same pair shouldn't change meaning, but we don't want unbounded growth.
const INTENT_CACHE = new Map<string, { intent: ImageIntent; ts: number }>();
const INTENT_CACHE_TTL_MS = 10 * 60 * 1000;
const INTENT_CACHE_MAX = 500;

function intentCacheKey(last: string, current: string): string {
  return `${last.trim().toLowerCase()}||${current.trim().toLowerCase()}`;
}

function getCachedIntent(last: string, current: string): ImageIntent | null {
  const key = intentCacheKey(last, current);
  const hit = INTENT_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > INTENT_CACHE_TTL_MS) {
    INTENT_CACHE.delete(key);
    return null;
  }
  return hit.intent;
}

function setCachedIntent(last: string, current: string, intent: ImageIntent): void {
  if (INTENT_CACHE.size >= INTENT_CACHE_MAX) {
    // Crude bound — drop the oldest 100 entries.
    const entries = Array.from(INTENT_CACHE.entries()).sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 100 && i < entries.length; i++) INTENT_CACHE.delete(entries[i][0]);
  }
  INTENT_CACHE.set(intentCacheKey(last, current), { intent, ts: Date.now() });
}

/** Strong "definitely a fresh image" signal — overrides edit guess. */
function isDefinitelyCreate(prompt: string): boolean {
  const p = prompt.toLowerCase().trim();
  // Very long detailed prompts (>25 words) are almost never edit instructions.
  const wordCount = p.split(/\s+/).length;
  if (wordCount > 25) return true;
  // Explicit "new image" / "different image" / "another image"
  if (/\b(new|different|another|fresh|separate|brand[\s-]?new)\s+(image|picture|photo|version of a|version with)\b/.test(p)) return true;
  // "Image of <noun>" with no reference to previous → describes a wholly new scene
  if (/^(an?|the)\s+(image|picture|photo|illustration|painting|drawing|render)\s+of\s+/.test(p)) return true;
  return false;
}

/**
 * LLM-based intent classifier — call only for ambiguous cases. Uses Gemini's
 * cheapest fast model so the latency budget is ~300-500ms and cost is
 * trivial. Returns null on any error / timeout so the caller can fall back.
 */
async function classifyImageIntentWithLLM(
  currentPrompt: string,
  lastPrompt: string,
): Promise<ImageIntent | null> {
  const apiKey = getApiKey('gemini');
  if (!apiKey) return null;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const sys = `You classify whether a user's image prompt is asking to EDIT the previous image or CREATE a brand-new unrelated image.

PREVIOUS IMAGE PROMPT: "${lastPrompt}"
NEW USER MESSAGE: "${currentPrompt}"

Decide:
- EDIT — the new message is a modification, adjustment, addition, removal, restyling, recoloring, continuation, or variation of the previous image. Even phrasings like "create a brighter version", "make a version with X", "generate the same scene but Y" count as EDIT when they reference or build on the previous image.
- CREATE — the new message describes a completely different, unrelated subject or scene with no meaningful connection to the previous image.

Output EXACTLY one word: EDIT or CREATE. Nothing else.`;
    const res = await _withTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: sys }] }],
        generationConfig: { maxOutputTokens: 4, temperature: 0 },
      }),
      1500,
    );
    const text = (res as any)?.response?.text?.()?.trim?.().toUpperCase() ?? '';
    if (text.startsWith('EDIT')) return 'edit';
    if (text.startsWith('CREATE')) return 'create';
    return null;
  } catch (e: any) {
    console.warn('Intent classifier LLM failed:', e?.message || e);
    return null;
  }
}

/**
 * Final intent decision for the route layer. Always returns 'edit' or
 * 'create' — never null. Use this instead of calling isEditRequest()
 * directly when you have a previous image and want robust intent.
 *
 *   1. No previous image → 'create' (nothing to edit).
 *   2. Strong "definitely create" linguistic signal → 'create'.
 *   3. Strong "definitely edit" via isEditRequest() keyword pass → 'edit'.
 *   4. Ambiguous → LLM classifier (cached).
 *   5. LLM fails → 'edit' as the recoverable default.
 */
export async function resolveImageIntent(
  currentPrompt: string,
  lastPrompt: string | undefined,
): Promise<ImageIntent> {
  if (!lastPrompt) return 'create';

  if (isDefinitelyCreate(currentPrompt)) {
    console.log(`🧭 Intent: CREATE (strong signal)`);
    return 'create';
  }

  if (isEditRequest(currentPrompt, lastPrompt)) {
    console.log(`🧭 Intent: EDIT (keyword pass)`);
    return 'edit';
  }

  // Ambiguous — try cache, then LLM.
  const cached = getCachedIntent(lastPrompt, currentPrompt);
  if (cached) {
    console.log(`🧭 Intent: ${cached.toUpperCase()} (cached)`);
    return cached;
  }

  const llmIntent = await classifyImageIntentWithLLM(currentPrompt, lastPrompt);
  if (llmIntent) {
    setCachedIntent(lastPrompt, currentPrompt, llmIntent);
    console.log(`🧭 Intent: ${llmIntent.toUpperCase()} (LLM classifier)`);
    return llmIntent;
  }

  // LLM unavailable — default to EDIT since a previous image exists. Treating
  // an edit as create loses the source image; treating a create as edit just
  // gives the user a related result they can correct with the next prompt.
  console.log(`🧭 Intent: EDIT (fallback default — LLM unavailable)`);
  return 'edit';
}

/**
 * Download image from URL and convert to data URL (for passing to AI as reference)
 */
export async function downloadImageAsDataUrl(imageUrl: string): Promise<string | null> {
  try {
    console.log(`📥 Downloading image from: ${imageUrl.substring(0, 100)}...`);
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`Failed to download image: ${response.status}`);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;
    
    console.log(`✅ Image downloaded and converted to data URL (${(base64.length / 1024).toFixed(2)}KB)`);
    return dataUrl;
  } catch (error) {
    console.error('Error downloading image:', error);
    return null;
  }
}
