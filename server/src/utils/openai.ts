import OpenAI from 'openai';
import type { AnswerResult, Mode, LLMModel, Source } from '../types.js';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('OPENAI_TIMEOUT')), ms);
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

function mapModel(model: LLMModel): string {
  // Map frontend model names to OpenAI models; fall back to a sensible default
  switch (model) {
    case 'gpt-4':
      return 'gpt-4o-mini';
    case 'gpt-3.5-turbo':
      return 'gpt-4o-mini';
    default:
      return 'gpt-4o-mini';
  }
}

function chunkTextToAnswer(text: string, sources: Source[]): AnswerResult['chunks'] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) {
    return [{ text, citationIds: sources.slice(0, 2).map((s) => s.id), confidence: 0.9 }];
  }
  return sentences.map((s, i) => ({
    text: s,
    citationIds: sources.slice(0, Math.min(2 + (i % 3), sources.length)).map((src) => src.id),
    confidence: Math.max(0.6, 0.95 - i * 0.05)
  }));
}

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

  // Provide minimal instruction to keep answers concise and factual
  const sys = `You are a helpful assistant. Answer succinctly for mobile UI. Provide clear, factual content suitable for brief reading.`;
  const prompt = `Mode: ${mode}\nQuery: ${query}\nAnswer clearly in a few short paragraphs.`;

  const response = await withTimeout(
    client.chat.completions.create({
      model: mapModel(model),
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
  // We do not have citations from OpenAI here; keep placeholder sources minimal to match UI shape
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

