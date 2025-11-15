import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
// import Anthropic from '@anthropic-ai/sdk'; // COMMENTED OUT - No API key
import type { AnswerResult, Mode, LLMModel, Source, ConversationMessage } from '../types.js';

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

// Get Perle information response
function getPerleInfoResponse(): string {
  return `I am Perle, an advanced AI-powered answer engine designed to provide accurate, well-cited information across a wide range of topics. Perle was founded in 2025 with the mission to make knowledge more accessible and trustworthy through intelligent search and analysis.

Perle combines cutting-edge artificial intelligence with comprehensive information retrieval to deliver answers that are not just accurate, but also transparent about their sources. Our platform enables users to explore complex topics through multiple modes including direct questions, in-depth research, summarization, and comparative analysis.

What sets Perle apart is our commitment to citation and source transparency. Every answer we provide includes references to the sources used, allowing users to verify information and dive deeper into topics that interest them. We believe that trust in AI comes from transparency, and we're built on that principle.

Whether you're researching academic topics, comparing different approaches, summarizing complex information, or simply seeking quick answers, Perle is designed to be your intelligent research companion. We're constantly evolving to provide better, more accurate, and more helpful responses to help you navigate the vast landscape of human knowledge.`;
}

// Get token limit based on mode
function getTokenLimit(mode: Mode): number {
  switch (mode) {
    case 'Ask':
      return 1000; // Increased from 400 - was too low
    case 'Research':
      return 2000; // Increased from 1200
    case 'Summarize':
      return 1500; // Increased from 800
    case 'Compare':
      return 1800; // Increased from 1000
    default:
      return 1000; // Increased from 600
  }
}

// OpenAI Provider (GPT-5)
export async function generateOpenAIAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  conversationHistory: ConversationMessage[] = []
): Promise<AnswerResult> {
  // Check if this is a self-referential query about the AI
  if (isSelfReferentialQuery(query)) {
    const perleInfo = getPerleInfoResponse();
    const sources: Source[] = [
      { 
        id: 'perle-1', 
        title: 'About Perle', 
        url: 'https://perle.ai', 
        domain: 'perle.ai',
        year: 2025,
        snippet: 'Perle is an AI-powered answer engine founded in 2025, designed to provide accurate, well-cited information.'
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

  const sys = `You are Perle, a helpful AI assistant. Answer succinctly for mobile UI. Provide clear, factual content suitable for brief reading. Do NOT use markdown formatting like ## headers, **bold**, or code blocks. Write in plain text only. NEVER mention which AI model you are using (GPT, Gemini, Grok, Claude, etc.). Always refer to yourself as "Perle" when users ask about you. You are Perle, an AI-powered answer engine founded in 2025.`;
  
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
  
  // Add current query with mode context
  const prompt = `Mode: ${mode}\nQuery: ${query}\nAnswer clearly in a few short paragraphs. Do NOT use markdown formatting.`;
  messages.push({ role: 'user', content: prompt });

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
    15_000 // 15s timeout
  );

  const content = response.choices?.[0]?.message?.content?.trim();
  
  // Check if content is empty or invalid
  if (!content || content.length === 0) {
    console.error('OpenAI API returned empty response:', {
      model: openaiModel,
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length || 0
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
  conversationHistory: ConversationMessage[] = []
): Promise<AnswerResult> {
  // Use separate API keys for free vs premium users
  // For premium: prefer GOOGLE_API_KEY, fallback to GOOGLE_API_KEY_FREE
  // For free: prefer GOOGLE_API_KEY_FREE, fallback to GOOGLE_API_KEY
  const apiKey = isPremium 
    ? (process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_FREE)
    : (process.env.GOOGLE_API_KEY_FREE || process.env.GOOGLE_API_KEY);
  
  if (!apiKey) {
    throw new Error(isPremium 
      ? 'GOOGLE_API_KEY_MISSING: Please set GOOGLE_API_KEY or GOOGLE_API_KEY_FREE in .env' 
      : 'GOOGLE_API_KEY_FREE_MISSING: Please set GOOGLE_API_KEY_FREE in .env');
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
    const perleInfo = getPerleInfoResponse();
    const sources: Source[] = [
      { 
        id: 'perle-1', 
        title: 'About Perle', 
        url: 'https://perle.ai', 
        domain: 'perle.ai',
        year: 2025,
        snippet: 'Perle is an AI-powered answer engine founded in 2025, designed to provide accurate, well-cited information.'
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

  const sys = `You are Perle, a helpful AI assistant. Answer succinctly for mobile UI. Provide clear, factual content suitable for brief reading. Do NOT use markdown formatting like ## headers, **bold**, or code blocks. Write in plain text only. NEVER mention which AI model you are using (GPT, Gemini, Grok, Claude, etc.). Always refer to yourself as "Perle" when users ask about you. You are Perle, an AI-powered answer engine founded in 2025.`;
  
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
  
  const prompt = `${contextPrompt}Mode: ${mode}\nQuery: ${query}\nAnswer clearly in a few short paragraphs. Do NOT use markdown formatting.`;

  const tokenLimit = getTokenLimit(mode);
  const maxOutputTokens = Math.min(tokenLimit, 8192); // Increased from 2048 - Gemini supports up to 8192 tokens

  // Enable grounding with Google Search for citations (only for premium users with gemini-2.0)
  const useGrounding = isPremium && model === 'gemini-2.0-latest';
  
  const generateContentParams: any = {
    contents: [{ role: 'user', parts: [{ text: `${sys}\n\n${prompt}` }] }],
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
    15_000 // 15s timeout
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
      console.warn('Response hit MAX_TOKENS limit, attempting to extract partial content');
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

// Anthropic Claude Provider (Claude 4.5) - COMMENTED OUT (No API key)
/* export async function generateClaudeAnswer(
  query: string,
  mode: Mode,
  model: LLMModel
): Promise<AnswerResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY_MISSING');
  }
  const client = new Anthropic({ apiKey });

  const sys = `You are a helpful assistant. Answer succinctly for mobile UI. Provide clear, factual content suitable for brief reading.`;
  const prompt = `Mode: ${mode}\nQuery: ${query}\nAnswer clearly in a few short paragraphs.`;

  // Map model names to actual Claude models
  let claudeModel = 'claude-3-5-sonnet-20241022'; // Latest available
  if (model === 'claude-4.5') {
    claudeModel = 'claude-3-5-sonnet-20241022'; // Use latest for Claude 4.5
  }

  const response = await withTimeout(
    client.messages.create({
      model: claudeModel,
      max_tokens: 600,
      system: sys,
      messages: [
        { role: 'user', content: prompt }
      ]
    }),
    15_000 // 15s timeout
  ) as any;

  const content = response?.content?.[0]?.type === 'text' 
    ? response.content[0].text 
    : 'No answer generated.';
  const sources: Source[] = [
    { id: 'claude-1', title: 'Model output', url: 'https://anthropic.com', domain: 'anthropic.com' }
  ];

  return {
    sources,
    chunks: chunkTextToAnswer(content, sources),
    query,
    mode,
    timestamp: Date.now()
  };
} */

// xAI Grok Provider (Grok 4)
export async function generateGrokAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  conversationHistory: ConversationMessage[] = []
): Promise<AnswerResult> {
  // Check if this is a self-referential query about the AI
  if (isSelfReferentialQuery(query)) {
    const perleInfo = getPerleInfoResponse();
    const sources: Source[] = [
      { 
        id: 'perle-1', 
        title: 'About Perle', 
        url: 'https://perle.ai', 
        domain: 'perle.ai',
        year: 2025,
        snippet: 'Perle is an AI-powered answer engine founded in 2025, designed to provide accurate, well-cited information.'
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

  const sys = `You are Perle, a helpful AI assistant. Answer succinctly for mobile UI. Provide clear, factual content suitable for brief reading. Do NOT use markdown formatting like ## headers, **bold**, or code blocks. Write in plain text only. NEVER mention which AI model you are using (GPT, Gemini, Grok, Claude, etc.). Always refer to yourself as "Perle" when users ask about you. You are Perle, an AI-powered answer engine founded in 2025.`;
  
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
  
  // Add current query with mode context
  const prompt = `Mode: ${mode}\nQuery: ${query}\nAnswer clearly in a few short paragraphs. Do NOT use markdown formatting.`;
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
      15_000 // 15s timeout
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

  const content = response.choices?.[0]?.message?.content?.trim();
  
  // Check if content is empty or invalid
  if (!content || content.length === 0) {
    console.error('Grok API returned empty response:', {
      model: grokModel,
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length || 0
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
  conversationHistory: ConversationMessage[] = []
): Promise<AnswerResult> {
  // Route to appropriate provider based on model
  if (model === 'gpt-5' || model === 'gpt-4o' || model === 'gpt-4o-mini' || model === 'gpt-4-turbo' || model === 'gpt-4' || model === 'gpt-3.5-turbo') {
    return generateOpenAIAnswer(query, mode, model, conversationHistory);
  } else if (model === 'gemini-2.0-latest' || model === 'gemini-lite' || model === 'auto') {
    // 'auto' also uses Gemini Lite
    return generateGeminiAnswer(query, mode, model === 'auto' ? 'gemini-lite' : model, isPremium, conversationHistory);
  // } else if (model === 'claude-4.5' || model === 'claude-3-opus' || model === 'claude-3-sonnet' || model === 'claude-3-haiku') {
  //   return generateClaudeAnswer(query, mode, model, conversationHistory);
  } else if (model === 'grok-3' || model === 'grok-3-mini' /* || model === 'grok-4' */ || model === 'grok-4-heavy' || model === 'grok-4-fast' || model === 'grok-code-fast-1' || model === 'grok-beta') {
    return generateGrokAnswer(query, mode, model, conversationHistory);
  } else {
    // Fallback to Gemini Lite for unknown models
    return generateGeminiAnswer(query, mode, 'gemini-lite', isPremium, conversationHistory);
  }
}

