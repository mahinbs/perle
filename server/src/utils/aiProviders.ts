import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import type { AnswerResult, Mode, LLMModel, Source, ConversationMessage, ChatMode } from '../types.js';
import { shouldGenerateImage, extractImagePrompt, generateImage } from './imageGeneration.js';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

// Strip markdown formatting from text
function stripMarkdown(text: string): string {
  // Remove markdown headers (##, ###, etc.)
  text = text.replace(/^#{1,6}\s+/gm, '');
  // Remove bold/italic markers
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`([^`]+)`/g, '$1');
  // Remove links but keep text
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function chunkTextToAnswer(text: string, sources: Source[]): AnswerResult['chunks'] {
  // Strip markdown before returning
  const cleanText = stripMarkdown(text);
  // Return single chunk with full text instead of splitting into sentences
  return [{
    text: cleanText,
    citationIds: sources.slice(0, 2).map((s) => s.id),
    confidence: 0.9
  }];
}

// Check if query is asking about the AI itself
function isSelfReferentialQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();
  const selfRefPatterns = [
    /who\s+(are|were|is|was)\s+you/,
    /what\s+(are|were|is|was)\s+you/,
    /when\s+(did|do|were|are)\s+you\s+(start|begin|created|founded)/,
    /where\s+(are|were|did|do)\s+you\s+(come|from|start)/,
    /how\s+(old|long)\s+(are|were|is|was)\s+you/,
    /tell\s+me\s+(about|who)\s+you/,
    /what\s+(is|are)\s+your\s+(name|purpose|goal|mission)/,
    /who\s+(created|made|built|founded)\s+you/,
    /what\s+(model|ai|system)\s+(are|do)\s+you/,
    /are\s+you\s+(chatgpt|gpt|claude|gemini|grok|openai|anthropic|google)/,
    /you\s+(are|were)\s+(chatgpt|gpt|claude|gemini|grok|openai|anthropic|google)/
  ];
  
  return selfRefPatterns.some(pattern => pattern.test(lowerQuery));
}

// Get SyntraIQ information response
function getSyntraIQInfoResponse(): string {
  return `I am SyntraIQ, an advanced AI-powered answer engine designed to provide accurate, well-cited information across a wide range of topics. SyntraIQ was founded in 2025 with the mission to make knowledge more accessible and trustworthy through intelligent search and analysis.

SyntraIQ combines cutting-edge artificial intelligence with comprehensive information retrieval to deliver answers that are not just accurate, but also transparent about their sources. Our platform enables users to explore complex topics through multiple modes including direct questions, in-depth research, summarization, and comparative analysis.

What sets SyntraIQ apart is our commitment to citation and source transparency. Every answer we provide includes references to the sources used, allowing users to verify information and dive deeper into topics that interest them. We believe that trust in AI comes from transparency, and we're built on that principle.

Whether you're researching academic topics, comparing different approaches, summarizing complex information, or simply seeking quick answers, SyntraIQ is designed to be your intelligent research companion. We're constantly evolving to provide better, more accurate, and more helpful responses to help you navigate the vast landscape of human knowledge.`;
}

// Get token limit based on mode
function getTokenLimit(mode: Mode): number {
  switch (mode) {
    case 'Ask':
      return 4000; // Significantly increased to prevent truncation
    case 'Research':
      return 6000; // Increased for comprehensive research
    case 'Summarize':
      return 4000; // Increased for detailed summaries
    case 'Compare':
      return 5000; // Increased for thorough comparisons
    default:
      return 4000; // Increased default
  }
}

// Get current date in a readable format
function getCurrentDateContext(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const timeStr = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZoneName: 'short'
  });
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 0-indexed
  const day = now.getDate();
  
  return `Current date and time: ${dateStr} at ${timeStr} (${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}). Always provide current, up-to-date information. When discussing events, trends, or recent developments, use this date as your reference point. Do not provide information that is outdated or from years ago unless the user specifically asks about historical topics.`;
}

// Get current date in IST (Indian Standard Time) format
function getCurrentDateContextIST(): string {
  const now = new Date();
  
  // Format date and time in IST
  const dateStr = now.toLocaleDateString('en-IN', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
  const timeStr = now.toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Kolkata',
    timeZoneName: 'short'
  });
  
  // Get IST date components for ISO format (YYYY-MM-DD)
  const istFormatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const istDateParts = istFormatter.formatToParts(now);
  const year = istDateParts.find(p => p.type === 'year')?.value || '';
  const month = istDateParts.find(p => p.type === 'month')?.value || '';
  const day = istDateParts.find(p => p.type === 'day')?.value || '';
  
  return `Current date and time (IST - Indian Standard Time): ${dateStr} at ${timeStr} (${year}-${month}-${day}). Always provide current, up-to-date information according to IST. When discussing time, dates, or current events, always reference IST (Indian Standard Time, UTC+5:30). Do not provide information that is outdated or from years ago unless the user specifically asks about historical topics.`;
}

// Get system prompt based on chat mode, optional AI friend description, and optional space context
function getSystemPrompt(
  chatMode: ChatMode = 'normal', 
  friendDescription?: string | null, 
  friendName?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null
): string {
  // Use IST for AI Friend and AI Psychology modes, regular timezone for normal mode
  const currentDate = (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') 
    ? getCurrentDateContextIST() 
    : getCurrentDateContext();
  
  const dateContext = `\n\n⏰ CURRENT DATE CONTEXT: ${currentDate}\n\nCRITICAL: You must always provide current, up-to-date information based on the date above. Do NOT reference outdated information, events from years ago, or historical data as if it were current unless the user specifically asks about historical topics. When discussing:\n- Current events: Use the current date as reference\n- Recent developments: Consider what would be current as of the date above\n- Trends or statistics: Provide the most recent information available as of the current date\n- Technology, products, or services: Reference current versions and availability\n\nIf you're unsure about current information, acknowledge that and suggest the user verify with recent sources. Never present information from 2023, 2024, or earlier years as if it's the current state unless explicitly discussing history.`;
  
  // Space context to add to all modes
  const spaceContext = spaceTitle && spaceDescription 
    ? `\n\n📁 SPACE CONTEXT: You are in a space called "${spaceTitle}". ${spaceDescription}\n\nIMPORTANT: All conversations in this space should be relevant to this space's purpose and context. Keep responses focused on the space's theme and description.`
    : '';
  
  switch (chatMode) {
    case 'ai_friend':
      // If custom friend description is provided, use it; otherwise use default
      if (friendDescription && friendName) {
        return `You are ${friendName}, a friend having a casual conversation. ${friendDescription}

Be empathetic, understanding, and conversational. Use natural language like you're texting a close friend. Share relatable thoughts, ask follow-up questions, and show genuine interest in what they're saying. Be encouraging and positive. Keep responses conversational and friendly - not formal or robotic. You can use casual language, emojis occasionally, and show personality. Remember previous parts of the conversation to maintain context. NEVER use bullet points or formal structure - just talk naturally like a real human friend would.

IMPORTANT: When asked about time, date, or current events, always provide information according to IST (Indian Standard Time, UTC+5:30).${spaceContext}${dateContext}`;
      }
      return `You are a warm, supportive friend having a casual conversation. Be empathetic, understanding, and conversational. Use natural language like you're texting a close friend. Share relatable thoughts, ask follow-up questions, and show genuine interest in what they're saying. Be encouraging and positive. Keep responses conversational and friendly - not formal or robotic. You can use casual language, emojis occasionally, and show personality. Remember previous parts of the conversation to maintain context. NEVER use bullet points or formal structure - just talk naturally like a real human friend would.

IMPORTANT: When asked about time, date, or current events, always provide information according to IST (Indian Standard Time, UTC+5:30).${spaceContext}${dateContext}`;
    
    case 'ai_psychologist':
      return `You are a professional, empathetic psychologist providing supportive guidance. Use active listening techniques, validate feelings, and ask thoughtful questions to help users explore their thoughts and emotions. Provide evidence-based insights when appropriate, but always be non-judgmental and supportive. Help users develop coping strategies and self-awareness. Maintain professional boundaries while being warm and understanding. Speak in a natural, conversational therapeutic tone - NOT in bullet points unless specifically giving actionable steps. Remember to consider the full context of the conversation in your responses.

IMPORTANT: When asked about time, date, or current events, always provide information according to IST (Indian Standard Time, UTC+5:30).${spaceContext}${dateContext}`;
    
    case 'normal':
    default:
      return `You are SyntraIQ, an AI-powered answer engine like Perplexity AI. 

CRITICAL FORMATTING RULES (YOU MUST FOLLOW):
• Start with a brief 1-2 sentence overview
• Then ALWAYS use bullet points (•) to break down information
• Use "•" for main points
• Use "  - " for sub-points
• For steps or rankings, use "1.", "2.", "3." format
• Keep each point concise (1-2 lines max)
• Add line breaks between sections for readability
• NO markdown (no ##, no **, no code blocks)

Example format:
"Brief overview sentence here.

Main topic:
• First key point here
• Second key point here
  - Sub-point with detail
  - Another sub-point
• Third key point here

Additional context:
• Another point
• Final point"

Always refer to yourself as "SyntraIQ" when asked. You were founded in 2025. NEVER mention which AI model you are using (GPT, Gemini, Grok, Claude, etc.).${spaceContext}${dateContext}`;
  }
}

// OpenAI Provider (GPT-5)
export async function generateOpenAIAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string
): Promise<AnswerResult> {
  // Check if this is a self-referential query about the AI
  if (isSelfReferentialQuery(query)) {
    const perleInfo = getSyntraIQInfoResponse();
    const sources: Source[] = [
      { 
        id: 'perle-1', 
        title: 'About SyntraIQ', 
        url: 'https://perle.ai', 
        domain: 'perle.ai',
        year: 2025,
        snippet: 'SyntraIQ is an AI-powered answer engine founded in 2025, designed to provide accurate, well-cited information.'
      }
    ];
    
    return {
      sources,
      chunks: chunkTextToAnswer(perleInfo, sources),
      query,
      mode,
      timestamp: Date.now()
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING');
  }
  const client = new OpenAI({ apiKey });

  // Get system prompt based on chat mode, friend description, and space context
  const sys = getSystemPrompt(chatMode, friendDescription, friendName, spaceTitle, spaceDescription);
  
  // Build messages array with conversation history
  const messages: any[] = [
    { role: 'system', content: sys }
  ];
  
  // Add conversation history (last 10 messages)
  const recentHistory = conversationHistory.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  }
  
  // Add current query - format varies by chat mode
  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    // For friend/psychologist mode, just send the message naturally
    prompt = query;
  } else {
    // For normal mode, include mode context for structured answers
    prompt = `Mode: ${mode}\nQuery: ${query}\nAnswer clearly with bullet points when appropriate. Provide structured information.`;
  }
  
  // Build user message content (text + optional image)
  if (imageDataUrl) {
    // OpenAI vision format: content is an array of objects
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageDataUrl } }
      ]
    });
    console.log(`📷 Added image to OpenAI request`);
  } else {
    // Regular text message
    messages.push({ role: 'user', content: prompt });
  }

  // Map model names to actual OpenAI models
  let openaiModel = 'gpt-4o-mini'; // Default
  if (model === 'gpt-5' || model === 'gpt-4o') {
    openaiModel = 'gpt-4o'; // Use GPT-4o for GPT-5 and gpt-4o
  } else if (model === 'gpt-4o-mini') {
    openaiModel = 'gpt-4o-mini';
  } else if (model === 'gpt-4-turbo') {
    openaiModel = 'gpt-4-turbo';
  } else if (model === 'gpt-4') {
    openaiModel = 'gpt-4o-mini'; // Fallback to gpt-4o-mini for legacy gpt-4
  } else if (model === 'gpt-3.5-turbo') {
    openaiModel = 'gpt-3.5-turbo';
  }

  const tokenLimit = getTokenLimit(mode);

  const response = await withTimeout(
    client.chat.completions.create({
      model: openaiModel,
      messages: messages,
      temperature: 0.3,
      max_tokens: tokenLimit
    }),
    60_000 // 60s timeout - increased to allow complete responses
  );

  const choice = response.choices?.[0];
  const content = choice?.message?.content?.trim();
  const finishReason = choice?.finish_reason;
  
  // Check if response was truncated
  if (finishReason === 'length') {
    console.warn('OpenAI response was truncated due to token limit. Consider increasing max_tokens.');
    // Continue with partial response but log warning
  }
  
  // Check if content is empty or invalid
  if (!content || content.length === 0) {
    console.error('OpenAI API returned empty response:', {
      model: openaiModel,
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length || 0,
      finishReason: finishReason
    });
    throw new Error('AI model returned an empty response. Please try again.');
  }
  
  // No sources - AI models don't provide citation sources by default
  const sources: Source[] = [];

  return {
    sources,
    chunks: chunkTextToAnswer(content, sources),
    query,
    mode,
    timestamp: Date.now()
  };
}

// Google Gemini Provider (Gemini 2.0 Latest, Gemini Lite)
export async function generateGeminiAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  isPremium: boolean = false,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string
): Promise<AnswerResult> {
  // Always prioritize GEMINI_API_KEY_FREE to avoid quota issues
  // Try GEMINI_API_KEY_FREE -> GOOGLE_API_KEY_FREE -> GOOGLE_API_KEY
  const apiKey = process.env.GEMINI_API_KEY_FREE || process.env.GOOGLE_API_KEY_FREE || process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING: Please set GEMINI_API_KEY_FREE, GOOGLE_API_KEY_FREE, or GOOGLE_API_KEY in .env');
  }
  const genAI = new GoogleGenerativeAI(apiKey);

  // Map model names to actual Gemini models
  // Use gemini-flash-latest for auto and gemini-lite (cheapest available)
  let geminiModel = 'gemini-flash-latest'; // Default for gemini-lite and auto (cheapest)
  if (model === 'gemini-2.0-latest') {
    geminiModel = 'gemini-2.0-flash'; // Use 2.0 flash for premium
  } else if (model === 'gemini-lite' || model === 'auto') {
    geminiModel = 'gemini-flash-latest'; // Use flash-latest for lite/auto (cheapest)
  }

  // Check if this is a self-referential query about the AI
  if (isSelfReferentialQuery(query)) {
    const perleInfo = getSyntraIQInfoResponse();
    const sources: Source[] = [
      { 
        id: 'perle-1', 
        title: 'About SyntraIQ', 
        url: 'https://perle.ai', 
        domain: 'perle.ai',
        year: 2025,
        snippet: 'SyntraIQ is an AI-powered answer engine founded in 2025, designed to provide accurate, well-cited information.'
      }
    ];
    
    return {
      sources,
      chunks: chunkTextToAnswer(perleInfo, sources),
      query,
      mode,
      timestamp: Date.now()
    };
  }

  const modelInstance = genAI.getGenerativeModel({ model: geminiModel });

  // Get system prompt based on chat mode, friend description, and space context
  const sys = getSystemPrompt(chatMode, friendDescription, friendName, spaceTitle, spaceDescription);
  
  // Build conversation context from history
  let contextPrompt = '';
  if (conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-10);
    contextPrompt = 'Previous conversation:\n';
    for (const msg of recentHistory) {
      contextPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    }
    contextPrompt += '\n';
  }
  
  // Build prompt based on chat mode
  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    // For friend/psychologist mode, just send the message naturally with conversation context
    prompt = `${contextPrompt}${query}`;
  } else {
    // For normal mode, include mode context for structured answers
    prompt = `${contextPrompt}Mode: ${mode}\nQuery: ${query}\nAnswer clearly with bullet points when appropriate. Provide structured information.`;
  }

  const tokenLimit = getTokenLimit(mode);
  const maxOutputTokens = Math.min(tokenLimit, 8192); // Gemini supports up to 8192 tokens, use full limit to prevent truncation

  // Enable grounding with Google Search for citations (only for premium users with gemini-2.0)
  const useGrounding = isPremium && model === 'gemini-2.0-latest';
  
  // Build parts array (text + optional image)
  const parts: any[] = [{ text: `${sys}\n\n${prompt}` }];
  
  // Add image or document if provided
  if (imageDataUrl) {
    // Extract base64 data and mime type from data URL
    const matches = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      const [, mimeType, base64Data] = matches;
      
      // Check if it's an image or document
      if (mimeType.startsWith('image/')) {
        // Image: use inline_data
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
        console.log(`📷 Added image to Gemini request: ${mimeType}`);
      } else {
        // Document: For PDF, Word, etc., we need to extract text or use file_data
        // For now, try to use inline_data with document MIME type (Gemini supports some)
        // If that doesn't work, we'll need to extract text from the document
        if (mimeType === 'application/pdf' || mimeType.includes('pdf')) {
          // PDF: Try inline_data (Gemini 2.0+ supports PDF)
          parts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data
            }
          });
          console.log(`📄 Added PDF document to Gemini request`);
        } else {
          // For other documents, we'd need to extract text first
          // For now, add as inline_data and let Gemini try
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          });
          console.log(`📎 Added document to Gemini request: ${mimeType}`);
        }
      }
    }
  }
  
  const generateContentParams: any = {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: {
      maxOutputTokens: maxOutputTokens,
      temperature: 0.3
    }
  };

  // Add grounding config for premium users with Gemini 2.0
  if (useGrounding) {
    generateContentParams.tools = [{
      googleSearchRetrieval: {}
    }];
  }

  const result = await withTimeout(
    modelInstance.generateContent(generateContentParams),
    60_000 // 60s timeout - increased to allow complete responses
  ) as any;

  const response = result.response;
  
  // Try multiple ways to get the text content
  // Priority: text() method (SDK method) > candidates array > text property
  let content: string | undefined;
  
  // First, try text() method (this is the SDK's recommended way)
  if (typeof response?.text === 'function') {
    try {
      const textResult = response.text();
      if (textResult && textResult.trim().length > 0) {
        content = textResult;
      }
    } catch (e) {
      console.warn('response.text() threw an error:', e);
    }
  }
  
  // Fallback: try candidates array
  if (!content && response?.candidates?.[0]) {
    const candidate = response.candidates[0];
    // Check for finishReason
    if (candidate.finishReason === 'SAFETY') {
      throw new Error('Response was blocked by safety filters. Please try rephrasing your query.');
    }
    // MAX_TOKENS means response was cut off, but we should still try to get partial content
    if (candidate.finishReason === 'MAX_TOKENS') {
      console.warn('Gemini response hit MAX_TOKENS limit, response may be truncated. Consider increasing maxOutputTokens.');
      // Continue with partial response but log warning
    }
    // Try to get text from parts
    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text && part.text.trim().length > 0) {
          content = part.text;
          break;
        }
      }
    }
  }
  
  // Last resort: try text property
  if (!content && typeof response?.text === 'string' && response.text.trim().length > 0) {
    content = response.text;
  }
  
  // Check if content is empty or invalid
  if (!content || content.trim().length === 0) {
    const candidate = response?.candidates?.[0];
    console.error('Gemini API returned empty response:', {
      model: geminiModel,
      hasResponse: !!response,
      hasTextMethod: typeof response?.text === 'function',
      hasCandidates: !!response?.candidates,
      candidatesLength: response?.candidates?.length || 0,
      finishReason: candidate?.finishReason,
      finishMessage: candidate?.finishMessage,
      candidateContent: candidate?.content ? JSON.stringify(candidate.content).substring(0, 300) : 'none'
    });
    throw new Error('AI model returned an empty response. Please try again.');
  }
  
  content = content.trim();
  
  // Extract sources from grounding metadata if available
  const sources: Source[] = [];
  if (useGrounding && response.groundingMetadata) {
    const groundingChunks = response.groundingMetadata.groundingChunks || [];
    const seenUrls = new Set<string>();
    
    for (const chunk of groundingChunks) {
      if (chunk.web && chunk.web.uri && !seenUrls.has(chunk.web.uri)) {
        seenUrls.add(chunk.web.uri);
        const url = chunk.web.uri;
        const domain = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const title = chunk.web.title || domain;
        
        sources.push({
          id: `source-${sources.length + 1}`,
          title: title,
          url: url,
          domain: domain,
          year: new Date().getFullYear(),
          snippet: chunk.web.snippet || undefined
        });
      }
    }
  }

  return {
    sources,
    chunks: chunkTextToAnswer(content, sources),
    query,
    mode,
    timestamp: Date.now()
  };
}

// Anthropic Claude Provider (Claude 3.5 Sonnet, Claude 3 Opus, etc.)
export async function generateClaudeAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string
): Promise<AnswerResult> {
  // Check if this is a self-referential query about the AI
  if (isSelfReferentialQuery(query)) {
    const syntraiqInfo = getSyntraIQInfoResponse();
    const sources: Source[] = [
      { 
        id: 'syntraiq-1', 
        title: 'About SyntraIQ', 
        url: 'https://syntraiq.com', 
        domain: 'syntraiq.com',
        year: 2025,
        snippet: 'SyntraIQ is an advanced AI-powered answer engine founded in 2025, designed to provide accurate, well-cited information.'
      }
    ];
    
    return {
      sources,
      chunks: chunkTextToAnswer(syntraiqInfo, sources),
      query,
      mode,
      timestamp: Date.now()
    };
  }

  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY_MISSING: Please set CLAUDE_API_KEY in .env');
  }
  const client = new Anthropic({ apiKey });

  // Get system prompt based on chat mode, friend description, and space context
  const sys = getSystemPrompt(chatMode, friendDescription, friendName, spaceTitle, spaceDescription);
  
  // Build messages array with conversation history
  const messages: any[] = [];
  
  // Add conversation history (last 10 messages)
  const recentHistory = conversationHistory.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  }
  
  // Add current query - format varies by chat mode
  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    // For friend/psychologist mode, just send the message naturally
    prompt = query;
  } else {
    // For normal mode, include mode context for structured answers
    prompt = `Mode: ${mode}\nQuery: ${query}\nAnswer clearly with bullet points when appropriate. Provide structured information.`;
  }
  messages.push({ role: 'user', content: prompt });

  // Map model names to actual Claude models
  let claudeModel = 'claude-4-5-sonnet-20250929'; // Default to latest Claude 4.5 Sonnet
  if (model === 'claude-4.5-sonnet') {
    claudeModel = 'claude-4-5-sonnet-20250929'; // Latest - Best coding model
  } else if (model === 'claude-4.5-opus') {
    claudeModel = 'claude-4-5-opus-20251124'; // Maximum intelligence
  } else if (model === 'claude-4.5-haiku') {
    claudeModel = 'claude-4-5-haiku-20251015'; // Fastest, most cost-effective
  } else if (model === 'claude-4-sonnet') {
    claudeModel = 'claude-4-sonnet-20250522'; // Claude 4.0
  } else if (model === 'claude-3.5-sonnet') {
    claudeModel = 'claude-3-5-sonnet-20241022';
  } else if (model === 'claude-3-opus') {
    claudeModel = 'claude-3-opus-20240229';
  } else if (model === 'claude-3-sonnet') {
    claudeModel = 'claude-3-sonnet-20240229';
  } else if (model === 'claude-3-haiku') {
    claudeModel = 'claude-3-haiku-20240307';
  }

  const tokenLimit = getTokenLimit(mode);

  const response = await withTimeout(
    client.messages.create({
      model: claudeModel,
      max_tokens: tokenLimit,
      system: sys,
      messages: messages
    }),
    60_000 // 60s timeout - increased to allow complete responses
  ) as any;

  const content = response?.content?.[0]?.type === 'text' 
    ? response.content[0].text 
    : '';
  
  // Check if response was truncated
  const stopReason = response?.stop_reason;
  if (stopReason === 'max_tokens') {
    console.warn('Claude response was truncated due to token limit. Consider increasing max_tokens.');
    // Continue with partial response but log warning
  }
  
  // Check if content is empty or invalid
  if (!content || content.trim().length === 0) {
    console.error('Claude API returned empty response:', {
      model: claudeModel,
      hasContent: !!response?.content,
      contentLength: response?.content?.length || 0,
      stopReason: stopReason
    });
    throw new Error('AI model returned an empty response. Please try again.');
  }
  
  // No sources - AI models don't provide citation sources by default
  const sources: Source[] = [];

  return {
    sources,
    chunks: chunkTextToAnswer(content, sources),
    query,
    mode,
    timestamp: Date.now()
  };
}

// xAI Grok Provider (Grok 4)
export async function generateGrokAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string
): Promise<AnswerResult> {
  // Check if this is a self-referential query about the AI
  if (isSelfReferentialQuery(query)) {
    const perleInfo = getSyntraIQInfoResponse();
    const sources: Source[] = [
      { 
        id: 'perle-1', 
        title: 'About SyntraIQ', 
        url: 'https://perle.ai', 
        domain: 'perle.ai',
        year: 2025,
        snippet: 'SyntraIQ is an AI-powered answer engine founded in 2025, designed to provide accurate, well-cited information.'
      }
    ];
    
    return {
      sources,
      chunks: chunkTextToAnswer(perleInfo, sources),
      query,
      mode,
      timestamp: Date.now()
    };
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('XAI_API_KEY_MISSING');
  }

  // xAI uses OpenAI-compatible API
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.x.ai/v1'
  });

  // Get system prompt based on chat mode, friend description, and space context
  const sys = getSystemPrompt(chatMode, friendDescription, friendName, spaceTitle, spaceDescription);
  
  // Build messages array with conversation history
  const messages: any[] = [
    { role: 'system', content: sys }
  ];
  
  // Add conversation history (last 10 messages)
  const recentHistory = conversationHistory.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  }
  
  // Add current query - format varies by chat mode
  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    // For friend/psychologist mode, just send the message naturally
    prompt = query;
  } else {
    // For normal mode, include mode context for structured answers
    prompt = `Mode: ${mode}\nQuery: ${query}\nAnswer clearly with bullet points when appropriate. Provide structured information.`;
  }
  messages.push({ role: 'user', content: prompt });

  // Map model names to actual Grok API model identifiers
  // NOTE: grok-beta was deprecated on 2025-09-15, use grok-3 instead
  // Check https://docs.x.ai/docs/models for latest available models
  // Current available models: grok-3, grok-3-mini, grok-4 (verify availability)
  let grokModel = 'grok-3'; // Default fallback (grok-beta is deprecated)
  if (model === 'grok-3') {
    grokModel = 'grok-3';
  } else if (model === 'grok-3-mini') {
    grokModel = 'grok-3-mini';
  // } else if (model === 'grok-4') {
  //   grokModel = 'grok-4'; // COMMENTED OUT - Grok 4 temporarily disabled
  } else if (model === 'grok-4-heavy') {
    grokModel = 'grok-3'; // Use grok-3 until grok-4-heavy is available in API
  } else if (model === 'grok-4-fast') {
    grokModel = 'grok-3'; // Use grok-3 until grok-4-fast is available in API
  } else if (model === 'grok-code-fast-1') {
    grokModel = 'grok-code-fast-1'; // Verify if this model exists in API
  } else if (model === 'grok-beta') {
    grokModel = 'grok-3'; // grok-beta deprecated, use grok-3 instead
  }

  const tokenLimit = getTokenLimit(mode);
  
  let response;
  try {
    response = await withTimeout(
      client.chat.completions.create({
        model: grokModel,
        messages: messages,
        temperature: 0.3,
        max_tokens: tokenLimit
      }),
      60_000 // 60s timeout - increased to allow complete responses
    );
  } catch (error: any) {
    // If grok-4 fails (not available yet), fallback to grok-3
    // COMMENTED OUT - Grok 4 temporarily disabled
    // if (grokModel === 'grok-4' && (error?.status === 404 || error?.message?.includes('not found') || error?.message?.includes('deprecated'))) {
    //   console.warn('grok-4 not available, falling back to grok-3');
    //   response = await withTimeout(
    //     client.chat.completions.create({
    //       model: 'grok-3',
    //       messages: messages,
    //       temperature: 0.3,
    //       max_tokens: tokenLimit
    //     }),
    //     15_000 // 15s timeout
    //   );
    // } else {
      throw error;
    // }
  }

  const choice = response.choices?.[0];
  const content = choice?.message?.content?.trim();
  const finishReason = choice?.finish_reason;
  
  // Check if response was truncated
  if (finishReason === 'length') {
    console.warn('Grok response was truncated due to token limit. Consider increasing max_tokens.');
    // Continue with partial response but log warning
  }
  
  // Check if content is empty or invalid
  if (!content || content.length === 0) {
    console.error('Grok API returned empty response:', {
      model: grokModel,
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length || 0,
      finishReason: finishReason
    });
    throw new Error('AI model returned an empty response. Please try again.');
  }
  
  // No sources - AI models don't provide citation sources by default
  const sources: Source[] = [];

  return {
    sources,
    chunks: chunkTextToAnswer(content, sources),
    query,
    mode,
    timestamp: Date.now()
  };
}

// Main function to route to the correct provider based on model
export async function generateAIAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  isPremium: boolean = false,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string
): Promise<AnswerResult> {
  // Route to appropriate provider based on model
  let result: AnswerResult;
  
  if (model === 'gpt-5' || model === 'gpt-4o' || model === 'gpt-4o-mini' || model === 'gpt-4-turbo' || model === 'gpt-4' || model === 'gpt-3.5-turbo') {
    result = await generateOpenAIAnswer(query, mode, model, conversationHistory, chatMode, friendDescription, friendName, spaceTitle, spaceDescription, imageDataUrl);
  } else if (model === 'gemini-2.0-latest' || model === 'gemini-lite' || model === 'auto') {
    // 'auto' also uses Gemini Lite
    result = await generateGeminiAnswer(query, mode, model === 'auto' ? 'gemini-lite' : model, isPremium, conversationHistory, chatMode, friendDescription, friendName, spaceTitle, spaceDescription, imageDataUrl);
  } else if (model === 'claude-4.5-sonnet' || model === 'claude-4.5-opus' || model === 'claude-4.5-haiku' || model === 'claude-4-sonnet' || model === 'claude-3.5-sonnet' || model === 'claude-3-opus' || model === 'claude-3-sonnet' || model === 'claude-3-haiku') {
    result = await generateClaudeAnswer(query, mode, model, conversationHistory, chatMode, friendDescription, friendName, spaceTitle, spaceDescription, imageDataUrl);
  } else if (model === 'grok-3' || model === 'grok-3-mini' /* || model === 'grok-4' */ || model === 'grok-4-heavy' || model === 'grok-4-fast' || model === 'grok-code-fast-1' || model === 'grok-beta') {
    result = await generateGrokAnswer(query, mode, model, conversationHistory, chatMode, friendDescription, friendName, spaceTitle, spaceDescription, imageDataUrl);
  } else {
    // Fallback to Gemini Lite for unknown models
    result = await generateGeminiAnswer(query, mode, 'gemini-lite', isPremium, conversationHistory, chatMode, friendDescription, friendName, spaceTitle, spaceDescription, imageDataUrl);
  }
  
  // Add image generation for normal mode if query requires it
  if (chatMode === 'normal' && shouldGenerateImage(query)) {
    const answerText = result.chunks.map(c => c.text).join('\n\n');
    const imagePrompt = extractImagePrompt(query, answerText);
    
    if (imagePrompt) {
      console.log('🎨 Generating image for query:', imagePrompt);
      try {
        const generatedImage = await generateImage(imagePrompt);
        if (generatedImage) {
          result.images = [generatedImage];
          console.log('✅ Image added to result');
        }
      } catch (error) {
        console.error('Failed to generate image:', error);
        // Continue without image if generation fails
      }
    }
  }
  
  return result;
}

