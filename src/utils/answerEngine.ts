import type { Source, AnswerResult, Mode, LLMModel } from '../types';
import type { ChatResult } from '../types';
import { rerankSources, chunkAnswer } from './helpers';
import { getUserLocalContext } from './userLocalContext';

/** Sent to the API when the user submits attachments without typing a prompt. */
export const FILE_ONLY_DEFAULT_QUERY = 'Review the attached files.';

interface UploadedFile {
  id: string;
  file: File;
  type: 'image' | 'document' | 'other';
  preview?: string;
}

/**
 * Fake answer engine - replace with real API integration
 */
export function fakeAnswerEngine(query: string, mode: Mode, model: LLMModel = 'gpt-4', uploadedFiles: UploadedFile[] = []): AnswerResult {
  const baseSources: Source[] = [
    { 
      id: 's1', 
      title: 'MIT Technology Review — On-device AI', 
      url: 'https://www.technologyreview.com/2024/01/on-device-ai', 
      year: 2024,
      domain: 'technologyreview.com',
      snippet: 'On-device AI models are revolutionizing how we interact with technology...'
    },
    { 
      id: 's2', 
      title: 'Nature: Efficient Transformers (2023)', 
      url: 'https://www.nature.com/articles/efficient-transformers', 
      year: 2023,
      domain: 'nature.com',
      snippet: 'Recent advances in transformer architecture have enabled more efficient inference...'
    },
    { 
      id: 's3', 
      title: 'OECD Digital Economy Outlook', 
      url: 'https://www.oecd.org/digital-economy-outlook', 
      year: 2022,
      domain: 'oecd.org',
      snippet: 'The digital economy continues to evolve with new AI technologies...'
    },
    { 
      id: 's4', 
      title: 'NIST Blog — Trustworthy AI', 
      url: 'https://www.nist.gov/trustworthy-ai', 
      year: 2021,
      domain: 'nist.gov',
      snippet: 'Building trustworthy AI systems requires careful consideration of...'
    },
    { 
      id: 's5', 
      title: 'WHO Fact Sheet on Digital Health', 
      url: 'https://www.who.int/digital-health', 
      year: 2020,
      domain: 'who.int',
      snippet: 'Digital health technologies are transforming healthcare delivery...'
    },
  ];

  const sources = rerankSources(baseSources, query);
  
  // Add file sources if any files were uploaded
  const fileSources: Source[] = uploadedFiles.map((file) => ({
    id: `file-${file.id}`,
    title: `Uploaded ${file.type}: ${file.file.name}`,
    url: `file://${file.file.name}`,
    year: new Date().getFullYear(),
    domain: 'uploaded-file',
    snippet: `User uploaded ${file.type} file: ${file.file.name} (${(file.file.size / 1024).toFixed(1)} KB)`
  }));
  
  const allSources = [...fileSources, ...sources];
  
  const body = generateAnswerBody(query, mode, model, uploadedFiles);
  const chunks = chunkAnswer(body, allSources);
  
  return {
    sources: allSources,
    chunks,
    query,
    mode,
    timestamp: Date.now()
  };
}

function generateAnswerBody(query: string, mode: Mode, model: LLMModel, uploadedFiles: UploadedFile[] = []): string {
  const modelPrefix = getModelPrefix(model);
  const hasFiles = uploadedFiles.length > 0;
  const fileContext = hasFiles ? ` (analyzing ${uploadedFiles.length} uploaded file${uploadedFiles.length > 1 ? 's' : ''})` : '';
  
  switch (mode) {
    case 'Ask':
      // ${modelPrefix} 
      return `
      ${query} in brief${fileContext}: On-device models reduce latency and cost while improving privacy. Expect hybrid retrieval (local + cloud), compressed architectures, and task-tuned context windows. The shift toward edge computing represents a fundamental change in how AI systems are deployed and scaled.${hasFiles ? ' Based on your uploaded files, I can provide more specific insights about how these technologies might apply to your use case.' : ''}`;
      
    case 'Research':
      return `${modelPrefix} ${query}: Landscape overview, recent advances, trade-offs, and open questions. Edge inference delivers responsiveness and energy savings, with server fallback for heavy jobs. Key considerations include model compression techniques, quantization strategies, and the balance between accuracy and efficiency. Current research focuses on developing more efficient architectures that can run on resource-constrained devices.${hasFiles ? ' Your uploaded files provide additional context for this research analysis.' : ''}`;
      
    case 'Summarize':
      return `${modelPrefix} TL;DR for ${query}${fileContext}: 1) Lower latency through local processing, 2) Better privacy with on-device data handling, 3) Cost control by reducing cloud dependencies. Watch quantization quality, evaluation drift, and user experience trade-offs. The technology is rapidly maturing with significant improvements in model efficiency and deployment strategies.${hasFiles ? ' The uploaded files have been considered in this summary.' : ''}`;
      
    case 'Compare':
      return `${modelPrefix} Comparing for ${query}${fileContext}: On-device vs Cloud — latency (10-100ms vs 200-2000ms), cost (fixed vs variable), privacy (local vs remote). Finetune vs RAG — data freshness vs ownership, customization vs generalization. Each approach has distinct advantages depending on use case requirements and constraints.${hasFiles ? ' Your uploaded files help illustrate these comparisons with real examples.' : ''}`;
      
    default:
      return `${modelPrefix} Analysis of ${query}${fileContext}: This topic involves multiple technical and strategic considerations that impact both current implementations and future development directions.${hasFiles ? ' The uploaded files provide valuable context for this analysis.' : ''}`;
  }
}

function getModelPrefix(model: LLMModel): string {
  switch (model) {
    case 'auto':
      return '[Auto]';
    case 'gpt-5':
      return '[GPT-5]';
    case 'gemini-2.0-latest':
      return '[Gemini 2.0]';
    // case 'grok-4': // COMMENTED OUT - temporarily disabled
    //   return '[Grok 4]';
    // case 'claude-4.5':
    //   return '[Claude 4.5]';
    case 'gemini-lite':
      return '[Gemini Lite]';
    case 'gpt-4':
      return '[GPT-4]';
    case 'gpt-3.5-turbo':
      return '[GPT-3.5]';
    // case 'claude-3-opus':
    //   return '[Claude Opus]';
    // case 'claude-3-sonnet':
    //   return '[Claude Sonnet]';
    // case 'claude-3-haiku':
    //   return '[Claude Haiku]';
    case 'gemini-pro':
      return '[Gemini Pro]';
    case 'gemini-pro-vision':
      return '[Gemini Vision]';
    case 'llama-2':
      return '[Llama 2]';
    case 'mistral-7b':
      return '[Mistral 7B]';
    default:
      return '[AI]';
  }
}

/**
 * Build search/chat FormData including all files under the single 'files' field.
 */
function buildSearchFormData(
  params: {
    query?: string;
    message?: string;
    mode?: Mode;
    model: LLMModel;
    newConversation?: boolean;
    conversationId?: string | null;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    searchType?: 'auto' | 'instant' | 'deep';
    userContext?: object;
    chatMode?: string;
    aiFriendId?: string;
    spaceId?: string;
  },
  uploadedFiles: UploadedFile[] = []
): FormData {
  const formData = new FormData();
  if (params.query) formData.append('query', params.query);
  if (params.message) formData.append('message', params.message);
  if (params.mode) formData.append('mode', params.mode);
  formData.append('model', params.model);
  if (params.newConversation !== undefined) formData.append('newConversation', String(params.newConversation));
  if (params.conversationId) formData.append('conversationId', params.conversationId);
  if (params.conversationHistory?.length) formData.append('conversationHistory', JSON.stringify(params.conversationHistory));
  if (params.searchType) formData.append('searchType', params.searchType);
  if (params.userContext) formData.append('userContext', JSON.stringify(params.userContext));
  if (params.chatMode) formData.append('chatMode', params.chatMode);
  if (params.aiFriendId) formData.append('aiFriendId', params.aiFriendId);
  if (params.spaceId) formData.append('spaceId', params.spaceId);

  // Images, PDFs, and documents for analysis — all under the 'files' field
  for (const uploaded of uploadedFiles) {
    if (uploaded.file) {
      formData.append('files', uploaded.file, uploaded.file.name);
    }
  }

  return formData;
}

export async function searchAPI(
  query: string, 
  mode: Mode, 
  model: LLMModel = 'gemini-lite', 
  newConversation: boolean = false,
  uploadedFiles: UploadedFile[] = [],
  conversationId: string | null = null,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  searchType?: 'auto' | 'instant' | 'deep'
): Promise<AnswerResult & { conversationId?: string }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!baseUrl) {
    throw new Error('API URL not configured. Please set VITE_API_URL in your .env file.');
  }
  
  const { getAuthHeaders, saveTokensFromResponseHeaders } = await import('./auth');
  const userContext = getUserLocalContext();

  const formData = buildSearchFormData(
    { query, mode, model, newConversation, conversationId, conversationHistory, searchType, userContext },
    uploadedFiles
  );

  const headers = getAuthHeaders(false); // no Content-Type for FormData
  
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/search`, {
    method: 'POST',
    headers,
    body: formData
  });

  saveTokensFromResponseHeaders(res);
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
    const err = new Error(errorData.error || `API request failed with status ${res.status}`);
    if (res.status === 403 && errorData.limitReached) {
      (err as any).limitReached = true;
      (err as any).limitKind = errorData.kind;
    }
    throw err;
  }

  const data = await res.json();
  // Normalise: if backend returns chunks[], use them; if it returns message (chat fallback), wrap it
  if (!data.chunks && data.message) {
    data.chunks = [{ text: data.message, citationIds: [] }];
  }
  return data;
}

export async function chatAPI(
  message: string,
  model: LLMModel = 'gemini-lite',
  chatMode: string = 'normal',
  uploadedFiles: UploadedFile[] = [],
  conversationId: string | null = null,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  aiFriendId?: string,
  spaceId?: string,
): Promise<ChatResult> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!baseUrl) {
    throw new Error('API URL not configured. Please set VITE_API_URL in your .env file.');
  }

  const { getAuthHeaders, saveTokensFromResponseHeaders } = await import('./auth');
  const userContext = getUserLocalContext();

  const formData = buildSearchFormData(
    { message, model, chatMode, conversationId, conversationHistory, userContext, aiFriendId, spaceId },
    uploadedFiles
  );

  const headers = getAuthHeaders(false);

  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/chat`, {
    method: 'POST',
    headers,
    body: formData
  });

  saveTokensFromResponseHeaders(res);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `API request failed with status ${res.status}`);
  }

  return await res.json();
}

export async function getSearchSuggestions(query: string): Promise<string[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!baseUrl) {
    const suggestions = [
      `${query} benefits`,
      `${query} challenges`,
      `${query} future trends`,
      `${query} best practices`,
      `${query} comparison`,
    ];
    await new Promise(resolve => setTimeout(resolve, 200));
    return suggestions.slice(0, 3);
  }
  const url = `${baseUrl.replace(/\/+$/, '')}/api/suggestions?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return await res.json();
}

export async function getRelatedQueries(query: string): Promise<string[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!baseUrl) {
    const related = [
      'What are the alternatives to ' + query.toLowerCase(),
      'How does ' + query.toLowerCase() + ' work',
      'Why is ' + query.toLowerCase() + ' important',
      'When to use ' + query.toLowerCase(),
    ];
    await new Promise(resolve => setTimeout(resolve, 180));
    return related.slice(0, 4);
  }
  const url = `${baseUrl.replace(/\/+$/, '')}/api/related?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return await res.json();
}

// ── Streaming search ────────────────────────────────────────────────────────
export async function searchAPIStream(
  query: string,
  mode: Mode,
  model: LLMModel,
  newConversation: boolean,
  conversationId: string | null,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  searchType: 'auto' | 'instant' | 'deep' | undefined,
  callbacks: {
    onMeta: (conversationId: string | null) => void;
    onSources: (sources: Source[]) => void;
    onToken: (text: string) => void;
    onDone: (suggestedQuestions: string[]) => void;
    onError: (message: string) => void;
  }
): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;

  if (!baseUrl) {
    throw new Error('VITE_API_URL not set');
  }

  const { getAuthHeaders } = await import('./auth');

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/stream`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      query,
      mode,
      model,
      newConversation,
      conversationId,
      conversationHistory,
      searchType,
    }),
  });

  if (!response.ok || !response.body) {
    const errData = await response
      .json()
      .catch(() => ({ error: 'Stream failed' }));

    const err = new Error(errData.error || 'Stream failed');
    if (response.status === 403 && errData.limitReached) {
      (err as any).limitReached = true;
      (err as any).limitKind = errData.kind;
    }
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        try {
          const data = JSON.parse(line.slice(5).trim());

          if (currentEvent === 'meta') {
            callbacks.onMeta(data.conversationId ?? null);
          } else if (currentEvent === 'sources') {
            callbacks.onSources(data.sources ?? []);
          } else if (currentEvent === 'token') {
            callbacks.onToken(data.text ?? '');
          } else if (currentEvent === 'done') {
            callbacks.onDone(data.suggestedQuestions ?? []);
          } else if (currentEvent === 'error') {
            callbacks.onError(data.message ?? 'Error');
          }
        } catch {
          // Skip malformed line
        }

        currentEvent = '';
      }
    }
  }
}
