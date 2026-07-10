import type { Source, AnswerResult, Mode, LLMModel } from '../types';
import type { ChatResult } from '../types';
import { rerankSources, chunkAnswer } from './helpers';
import { getUserLocalContext } from './userLocalContext';

/** Sent to the API when the user submits attachments without typing a prompt. */
export const FILE_ONLY_DEFAULT_QUERY = 'Review the attached files.';

/** AI Friend + AI Psychology always use this model (server enforces the same). */
export const COMPANION_CHAT_MODEL: LLMModel = 'gemini-lite';

export function enrichQueryForLanguage(query: string): string {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  const multilingualGreetings = [
    // Tamil
    /நீங்கள்\s*எப்படி/,   // "How are you" (formal)
    /நீ\s*எப்படி/,        // "How are you" (informal)
    /வணக்கம்/,            // Vanakkam (Hello)
    /நன்றி/,              // Thank you
    /காலை\s*வணக்கம்/,    // Good morning
    /மாலை\s*வணக்கம்/,    // Good evening
    // Hindi / Devanagari
    /आप\s*कैसे\s*हैं/,     // How are you (formal)
    /तुम\s*कैसे\s*हो/,     // How are you (informal)
    /नमस्ते/,               // Namaste
    /नमस्कार/,              // Namaskar
    /धन्यवाद/,              // Thank you
    /शुक्रिया/,              // Shukriya (thanks)
    /सुप्रभात/,              // Good morning
    /अलविदा/,               // Goodbye
    // Telugu
    /మీరు\s*ఎలా\s*ఉన్నారు/, // How are you
    /నమస్కారం/,              // Hello
    /ధన్యవాదాలు/,            // Thank you
    // Kannada
    /ನೀವು\s*ಹೇಗಿದ್ದೀರಿ/,     // How are you
    /ನಮಸ್ಕಾರ/,               // Hello
    /ಧನ್ಯವಾದ/,               // Thank you
    // Malayalam
    /നിങ്ങൾ\s*എങ്ങനെ/,       // How are you
    /നമസ്കാരം/,               // Hello
    /നന്ദി/,                   // Thank you
    // Bengali
    /আপনি\s*কেমন\s*আছেন/,    // How are you
    /নমস্কার/,                  // Hello
    /ধন্যবাদ/,                  // Thank you
    // Marathi
    /तुम्ही\s*कसे\s*आहात/,    // How are you
    // Gujarati
    /તમે\s*કેમ\s*છો/,          // How are you
    /നમસ્તે/,                    // Hello
    // Punjabi
    /ਸਤ\s*ਸ੍ਰੀ\s*ਅਕਾਲ/,        // Hello
    /ਤੁਸੀਂ\s*ਕਿਵੇਂ\s*ਹੋ/,        // How are you
    // Arabic / Urdu
    /كيف\s*حالك/,               // How are you
    /مرحبا/,                    // Hello
    /شكرا/,                     // Thank you
    /السلام\s*عليكم/,           // Assalamu alaikum
  ];

  const isGreeting =
    multilingualGreetings.some((p) => p.test(trimmed)) ||
    /^(hi|hello|hey|yo|sup|what'?s up|how are you|how r u|good (morning|afternoon|evening))[\s!?.,]*$/i.test(lower) ||
    /(how are you|how r u)/i.test(lower);

  const isRegional = /[^\x00-\x7F]/.test(trimmed);

  if (isGreeting) {
    return `${trimmed}\n\n[MANDATORY CONVERSATIONAL DIRECTIVE: This is a greeting or conversational opener. Do NOT perform web search, do NOT output structured sections, do NOT use bullet points or headings. Reply in 1-2 friendly, natural sentences in the exact same language and script. If Tamil, reply in Tamil script. If Hindi, reply in Hindi Devanagari script.]`;
  }

  if (isRegional) {
    return `${trimmed}\n\n[MANDATORY LANGUAGE DIRECTIVE: Write your entire response — including all headings, bullets, and citations — in the exact same language and script as this query. If this query is in Tamil script, reply entirely in Tamil script. If in Hindi, reply entirely in Hindi Devanagari script. Never write the response or headings in English.]`;
  }

  return trimmed;
}

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
    groupChat?: boolean;
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
  if (params.groupChat) formData.append('groupChat', 'true');

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
  
  const { authFetch } = await import('./auth');
  const userContext = getUserLocalContext();
  const enrichedQuery = enrichQueryForLanguage(query);

  const formData = buildSearchFormData(
    { query: enrichedQuery, mode, model, newConversation, conversationId, conversationHistory, searchType, userContext },
    uploadedFiles
  );
  
  const res = await authFetch(`${baseUrl.replace(/\/+$/, '')}/api/search`, {
    method: 'POST',
    body: formData,
  });
  
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
  // Normalise: backend can legally return chunks[], a top-level `message`
  // (chat fallback), or `answer`. We coerce any of those into a chunks[]
  // shape. If absolutely nothing is present we still emit a one-chunk
  // explanatory message so downstream renderers never crash on a missing
  // .chunks property — that was the white-screen failure mode when a
  // multipart image upload hit an unusual provider error path.
  if (!Array.isArray(data.chunks) || data.chunks.length === 0) {
    const text =
      typeof data.message === "string" && data.message.trim().length > 0
        ? data.message
        : typeof data.answer === "string" && data.answer.trim().length > 0
        ? data.answer
        : typeof data.error === "string" && data.error.trim().length > 0
        ? `Error: ${data.error}`
        : "The server returned an empty response. Please try again.";
    data.chunks = [{ text, citationIds: [] }];
  }
  // Defensive sources array — some error paths omit it, but the renderer
  // iterates `sources` unconditionally and would crash on undefined.
  if (!Array.isArray(data.sources)) data.sources = [];
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
  newConversation: boolean = false,
  groupChat: boolean = false,
): Promise<ChatResult> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!baseUrl) {
    throw new Error('API URL not configured. Please set VITE_API_URL in your .env file.');
  }

  const { authFetch } = await import('./auth');
  const userContext = getUserLocalContext();

  const formData = buildSearchFormData(
    { message, model, chatMode, conversationId, conversationHistory, userContext, aiFriendId, spaceId, newConversation, groupChat },
    uploadedFiles
  );

  const res = await authFetch(`${baseUrl.replace(/\/+$/, '')}/api/chat`, {
    method: 'POST',
    body: formData,
  });

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
    /**
     * `cleanText` is the backend's authoritative final answer. When the stream
     * gets truncated mid-flight (e.g. model leaks the SUGGESTED_FOLLOWUPS
     * marker early, network hiccup), the sum of token events can be SHORTER
     * than `cleanText` — the UI should fall back to `cleanText` so the user
     * sees the complete answer.
     */
    onDone: (suggestedQuestions: string[], cleanText?: string) => void;
    onError: (message: string) => void;
  },
  uploadedFiles: UploadedFile[] = [],
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;

  if (!baseUrl) {
    throw new Error('VITE_API_URL not set');
  }

  const { authFetch, getAuthHeaders } = await import('./auth');

  // When files are attached we must send the request as multipart/form-data
  // so the backend's `/api/stream` route (which uses the same `uploadSearchFiles`
  // multer middleware as `/api/search`) can pick up the attachments. The
  // browser sets the multipart boundary header automatically — passing our
  // usual JSON Content-Type would corrupt the form-data parser — so we pass
  // `false` to getAuthHeaders to drop the Content-Type header in the upload
  // branch.
  const hasUploads = uploadedFiles.some((f) => f.file);
  const userContext = getUserLocalContext();
  const enrichedQuery = enrichQueryForLanguage(query);

  let response: Response;
  if (hasUploads) {
    const formData = buildSearchFormData(
      { query: enrichedQuery, mode, model, newConversation, conversationId, conversationHistory, searchType, userContext },
      uploadedFiles,
    );
    response = await authFetch(`${baseUrl.replace(/\/+$/, '')}/api/stream`, {
      method: 'POST',
      headers: getAuthHeaders(false), // skip Content-Type so multipart boundary stays correct
      body: formData,
      signal,
    });
  } else {
    response = await authFetch(`${baseUrl.replace(/\/+$/, '')}/api/stream`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        query: enrichedQuery,
        mode,
        model,
        newConversation,
        conversationId,
        conversationHistory,
        searchType,
      }),
      signal,
    });
  }

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

  const cancelReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal) {
    if (signal.aborted) {
      cancelReader();
      return;
    }
    signal.addEventListener('abort', cancelReader, { once: true });
  }

  let buffer = '';
  let currentEvent = '';

  try {
    while (true) {
      if (signal?.aborted) break;

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
              callbacks.onDone(data.suggestedQuestions ?? [], data.cleanText);
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
  } finally {
    signal?.removeEventListener('abort', cancelReader);
  }
}
