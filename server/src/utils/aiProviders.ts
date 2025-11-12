import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import type { AnswerResult, Mode, LLMModel, Source } from '../types.js';

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

function chunkTextToAnswer(text: string, sources: Source[]): AnswerResult['chunks'] {
  // Return single chunk with full text instead of splitting into sentences
  return [{
    text: text.trim(),
    citationIds: sources.slice(0, 2).map((s) => s.id),
    confidence: 0.9
  }];
}

// OpenAI Provider (GPT-5)
export async function generateOpenAIAnswer(
  query: string,
  mode: Mode,
  model: LLMModel
): Promise<AnswerResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING');
  }
  const client = new OpenAI({ apiKey });

  const sys = `You are a helpful assistant. Answer succinctly for mobile UI. Provide clear, factual content suitable for brief reading.`;
  const prompt = `Mode: ${mode}\nQuery: ${query}\nAnswer clearly in a few short paragraphs.`;

  // Map model names to actual OpenAI models
  let openaiModel = 'gpt-4o-mini'; // Default
  if (model === 'gpt-5') {
    openaiModel = 'gpt-4o'; // Use latest available for GPT-5
  } else if (model === 'gpt-4') {
    openaiModel = 'gpt-4o-mini';
  }

  const response = await withTimeout(
    client.chat.completions.create({
      model: openaiModel,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 600
    }),
    15_000 // 15s timeout
  );

  const content = response.choices?.[0]?.message?.content?.trim() || 'No answer generated.';
  const sources: Source[] = [
    { id: 'oai-1', title: 'Model output', url: 'https://openai.com', domain: 'openai.com' }
  ];

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
  isPremium: boolean = false
): Promise<AnswerResult> {
  // Use separate API keys for free vs premium users
  const apiKey = isPremium 
    ? process.env.GOOGLE_API_KEY 
    : (process.env.GOOGLE_API_KEY_FREE || process.env.GOOGLE_API_KEY);
  
  if (!apiKey) {
    throw new Error(isPremium ? 'GOOGLE_API_KEY_MISSING' : 'GOOGLE_API_KEY_FREE_MISSING');
  }
  const genAI = new GoogleGenerativeAI(apiKey);

  // Map model names to actual Gemini models
  // Use correct model names that are available in the API (from REST API list)
  let geminiModel = 'gemini-flash-latest'; // Default for gemini-lite (free tier)
  if (model === 'gemini-2.0-latest') {
    geminiModel = 'gemini-2.0-flash'; // Use 2.0 flash for premium
  } else if (model === 'gemini-lite') {
    geminiModel = 'gemini-flash-latest'; // Use flash-latest for lite (free tier)
  }

  const modelInstance = genAI.getGenerativeModel({ model: geminiModel });

  const sys = `You are a helpful assistant. Answer succinctly for mobile UI. Provide clear, factual content suitable for brief reading.`;
  const prompt = `Mode: ${mode}\nQuery: ${query}\nAnswer clearly in a few short paragraphs.`;

  const result = await withTimeout(
    modelInstance.generateContent(`${sys}\n\n${prompt}`),
    15_000 // 15s timeout
  ) as any;

  const response = result.response;
  const content = response?.text() || 'No answer generated.';
  const sources: Source[] = [
    { id: 'gemini-1', title: 'Model output', url: 'https://ai.google.dev', domain: 'ai.google.dev' }
  ];

  return {
    sources,
    chunks: chunkTextToAnswer(content, sources),
    query,
    mode,
    timestamp: Date.now()
  };
}

// Anthropic Claude Provider (Claude 4.5)
export async function generateClaudeAnswer(
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
}

// xAI Grok Provider (Grok 4)
export async function generateGrokAnswer(
  query: string,
  mode: Mode,
  model: LLMModel
): Promise<AnswerResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('XAI_API_KEY_MISSING');
  }

  // xAI uses OpenAI-compatible API
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.x.ai/v1'
  });

  const sys = `You are a helpful assistant. Answer succinctly for mobile UI. Provide clear, factual content suitable for brief reading.`;
  const prompt = `Mode: ${mode}\nQuery: ${query}\nAnswer clearly in a few short paragraphs.`;

  // Map model names to actual Grok models
  let grokModel = 'grok-beta'; // Default
  if (model === 'grok-4') {
    grokModel = 'grok-beta'; // Use latest available for Grok 4
  }

  const response = await withTimeout(
    client.chat.completions.create({
      model: grokModel,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 600
    }),
    15_000 // 15s timeout
  );

  const content = response.choices?.[0]?.message?.content?.trim() || 'No answer generated.';
  const sources: Source[] = [
    { id: 'grok-1', title: 'Model output', url: 'https://x.ai', domain: 'x.ai' }
  ];

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
  isPremium: boolean = false
): Promise<AnswerResult> {
  // Route to appropriate provider based on model
  if (model === 'gpt-5' || model === 'gpt-4' || model === 'gpt-3.5-turbo') {
    return generateOpenAIAnswer(query, mode, model);
  } else if (model === 'gemini-2.0-latest' || model === 'gemini-lite' || model === 'auto') {
    // 'auto' also uses Gemini Lite
    return generateGeminiAnswer(query, mode, model === 'auto' ? 'gemini-lite' : model, isPremium);
  } else if (model === 'claude-4.5' || model === 'claude-3-opus' || model === 'claude-3-sonnet' || model === 'claude-3-haiku') {
    return generateClaudeAnswer(query, mode, model);
  } else if (model === 'grok-4') {
    return generateGrokAnswer(query, mode, model);
  } else {
    // Fallback to Gemini Lite for unknown models
    return generateGeminiAnswer(query, mode, 'gemini-lite', isPremium);
  }
}

