import type { AnswerResult, Mode, LLMModel, Source } from '../types';

function rerankSources(baseSources: Source[], _query: string): Source[] {
  // For now, return as-is. Placeholder for BM25/embedding rerank.
  return baseSources;
}

function chunkAnswer(body: string, sources: Source[]): AnswerResult['chunks'] {
  const parts = body
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const mapSources = sources.map((s) => s.id);
  return parts.map((text, i) => ({
    text,
    citationIds: mapSources.slice(0, Math.min(2 + (i % 3), mapSources.length)),
    confidence: 0.9 - (i * 0.05)
  }));
}

export function generateServerAnswer(
  query: string,
  mode: Mode,
  model: LLMModel = 'gpt-4'
): AnswerResult {
  const baseSources: Source[] = [
    { id: 's1', title: 'MIT Technology Review — On-device AI', url: 'https://www.technologyreview.com/2024/01/on-device-ai', year: 2024, domain: 'technologyreview.com' },
    { id: 's2', title: 'Nature: Efficient Transformers (2023)', url: 'https://www.nature.com/articles/efficient-transformers', year: 2023, domain: 'nature.com' },
    { id: 's3', title: 'OECD Digital Economy Outlook', url: 'https://www.oecd.org/digital-economy-outlook', year: 2022, domain: 'oecd.org' },
    { id: 's4', title: 'NIST Blog — Trustworthy AI', url: 'https://www.nist.gov/trustworthy-ai', year: 2021, domain: 'nist.gov' },
    { id: 's5', title: 'WHO Fact Sheet on Digital Health', url: 'https://www.who.int/digital-health', year: 2020, domain: 'who.int' },
  ];

  const sources = rerankSources(baseSources, query);
  const body = generateAnswerBody(query, mode, model);
  const chunks = chunkAnswer(body, sources);

  return {
    sources,
    chunks,
    query,
    mode,
    timestamp: Date.now()
  };
}

function getModelPrefix(model: LLMModel): string {
  switch (model) {
    case 'auto': return '[Auto]';
    case 'gpt-5': return '[GPT-5]';
    case 'gemini-2.0-latest': return '[Gemini 2.0]';
    case 'grok-4': return '[Grok 4]';
    case 'claude-4.5': return '[Claude 4.5]';
    case 'gemini-lite': return '[Gemini Lite]';
    case 'gpt-4': return '[GPT-4]';
    case 'gpt-3.5-turbo': return '[GPT-3.5]';
    case 'claude-3-opus': return '[Claude Opus]';
    case 'claude-3-sonnet': return '[Claude Sonnet]';
    case 'claude-3-haiku': return '[Claude Haiku]';
    case 'gemini-pro': return '[Gemini Pro]';
    case 'gemini-pro-vision': return '[Gemini Vision]';
    case 'llama-2': return '[Llama 2]';
    case 'mistral-7b': return '[Mistral 7B]';
    default: return '[AI]';
  }
}

function generateAnswerBody(query: string, mode: Mode, model: LLMModel): string {
  const modelPrefix = getModelPrefix(model);
  switch (mode) {
    case 'Ask':
      return `${modelPrefix} ${query} in brief: On-device models reduce latency and cost while improving privacy. Expect hybrid retrieval (local + cloud), compressed architectures, and task-tuned context windows.`;
    case 'Research':
      return `${modelPrefix} ${query}: Landscape overview, recent advances, trade-offs, and open questions. Edge inference delivers responsiveness and energy savings, with server fallback for heavy jobs.`;
    case 'Summarize':
      return `${modelPrefix} TL;DR for ${query}: 1) Lower latency via local processing, 2) Better privacy with on-device handling, 3) Cost control via reduced cloud dependency.`;
    case 'Compare':
      return `${modelPrefix} Comparing for ${query}: On-device vs Cloud — latency, cost, privacy. Finetune vs RAG — freshness vs ownership.`;
    default:
      return `${modelPrefix} Analysis of ${query}: Multiple technical and strategic considerations inform current and future directions.`;
  }
}

