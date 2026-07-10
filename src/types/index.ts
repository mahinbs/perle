export type Mode = 'Ask' | 'Research' | 'Summarize' | 'Compare';

// High-level chat experience modes used in the UI
export type ExperienceMode = 'normal' | 'web_search' | 'deep_research';

export type LLMModel =
  | 'exa-auto'
  | 'exa-instant'
  | 'exa-deep'
  | 'auto'
  // OpenAI
  | 'gpt-5' | 'gpt-5.1' | 'gpt-5.2' | 'gpt-5.3' | 'gpt-5.4' | 'gpt-5.5' | 'gpt-5.5-pro'
  | 'gpt-4.1' | 'gpt-4.1-mini' | 'gpt-4.1-nano'
  | 'o3' | 'o4-mini'
  | 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-4' | 'gpt-3.5-turbo'
  // Gemini
  | 'gemini-2.0-latest' | 'gemini-3.0' | 'gemini-3.1' | 'gemini-3.1-flash'
  | 'gemini-3.5-flash' | 'gemini-3.1-flash-lite' | 'gemini-lite'
  | 'gemini-pro' | 'gemini-pro-vision'
  // Claude
  | 'claude-4.8-opus' | 'claude-4.7-opus'
  | 'claude-4.5-sonnet' | 'claude-4.5-opus' | 'claude-4.6-sonnet' | 'claude-4.6-opus'
  | 'claude-4.5-haiku' | 'claude-4-sonnet' | 'claude-4-opus' | 'claude-4.1-opus' | 'claude-3-haiku'
  // Grok
  | 'grok-4.3' | 'grok-4.20' | 'grok-3' | 'grok-3-mini'
  | 'grok-4-heavy' | 'grok-4-fast' | 'grok-code-fast-1' | 'grok-beta'
  // DeepSeek
  | 'deepseek-v3.2' | 'deepseek-v3.2-exp' | 'deepseek-v3.1' | 'deepseek-r1'
  // Kimi / Moonshot
  | 'kimi-k2' | 'kimi-k2.5' | 'kimi-k2-thinking'
  // Perplexity (Sonar family)
  | 'perplexity-sonar' | 'perplexity-sonar-pro' | 'perplexity-sonar-reasoning-pro'
  | 'perplexity-deep-research' | 'perplexity-adv-deep-research'
  // Others
  | 'llama-2' | 'mistral-7b';

export interface FileAttachment {
  dataUrl: string;
  mimeType: string;
  filename?: string;
}

export interface LLMModelInfo {
  id: LLMModel;
  name: string;
  provider: string;
  description: string;
  capabilities: string[];
}

export interface Source {
  id: string;
  title: string;
  url: string;
  year?: number;
  domain?: string;
  snippet?: string;
}

export interface AnswerChunk {
  text: string;
  citationIds: string[];
  confidence?: number;
}

export interface UploadedFile {
  id: string;
  file: File;
  type: "image" | "document" | "other";
  preview?: string;
}

export interface GeneratedImage {
  url: string;
  prompt: string;
  width: number;
  height: number;
}

export interface AnswerResult {
  sources: Source[];
  chunks: AnswerChunk[];
  query: string;
  mode: Mode;
  timestamp: number;
  attachments?: UploadedFile[];
  generatedMedia?: { type: 'image' | 'video'; url: string; prompt: string };
  suggestedQuestions?: string[];
  conversationId?: string;
  images?: GeneratedImage[];
  /** Set when answer text was already shown via streaming — skip typewriter on finalize. */
  wasStreamed?: boolean;
  /** True while tokens are still arriving for this answer. */
  isStreaming?: boolean;
}

export interface ChatResult {
  message: string;
  model: string;
  sources: Source[];
  suggestedQuestions: string[];
  images?: GeneratedImage[];
}

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
  mode: Mode;
}

export interface DiscoverItem {
  id: string;
  title: string;
  tag: string;
  image: string;
  alt: string;
  description?: string;
  category?: string;
  nation?: string;
  nationCode?: string;
  /** Live-news items carry the original article URL + source domain. */
  url?: string;
  sourceDomain?: string;
  /** ISO publish time from upstream when available */
  publishedAt?: string;
  /** Epoch ms when we ingested this item into cache */
  fetchedAt?: number;
}

export interface LibraryItem {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  tags: string[];
  isBookmarked?: boolean;
}
