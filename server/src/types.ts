export type Mode = 'Ask' | 'Research' | 'Summarize' | 'Compare';

export type ChatMode = 'normal' | 'ai_friend' | 'ai_psychologist' | 'space';

export type LLMModel =
  | 'auto'
  | 'gpt-5'
  | 'gpt-5.1'
  | 'gpt-5.2'
  | 'gpt-5.3'
  | 'gpt-5.4'
  | 'gpt-5.5'
  | 'gpt-5.5-pro'
  | 'gpt-4.1'
  | 'gpt-4.1-mini'
  | 'gpt-4.1-nano'
  | 'o3'
  | 'o4-mini'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  | 'gpt-4'
  | 'gpt-3.5-turbo'
  | 'gemini-2.0-latest'
  | 'gemini-3.0'
  | 'gemini-3.1'
  | 'gemini-3.1-flash'
  | 'gemini-3.5-flash'
  | 'gemini-3.1-flash-lite'
  | 'gemini-lite'
  | 'grok-3'
  | 'grok-3-mini'
  | 'grok-4.3'
  | 'grok-4.20'
  | 'grok-4-heavy'
  | 'grok-4-fast'
  | 'grok-code-fast-1'
  | 'grok-beta'
  | 'claude-4.8-opus'
  | 'claude-4.7-opus'
  | 'claude-4.5-sonnet'
  | 'claude-4.5-opus'
  | 'claude-4.6-sonnet'
  | 'claude-4.6-opus'
  | 'claude-4.5-haiku'
  | 'claude-4-sonnet'
  | 'claude-4-opus'
  | 'claude-4.1-opus'
  | 'claude-3-haiku'
  | 'gemini-pro'
  | 'gemini-pro-vision'
  | 'llama-2'
  | 'mistral-7b';

export interface FileAttachment {
  dataUrl: string;
  mimeType: string;
  filename?: string;
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

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UserLocalContext {
  locale?: string;
  timeZone?: string;
  localDateTime?: string;
  countryCode?: string;
  currencyCode?: string;
  utcOffsetMinutes?: number;
  region?: string;
  city?: string;
  source?: 'client' | 'server-headers' | 'merged';
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
  images?: GeneratedImage[]; // Optional generated images
  suggestedQuestions?: string[];
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
}

export interface UserProfile {
  name: string;
  email: string;
  notifications: boolean;
  darkMode: boolean;
  searchHistory: boolean;
  voiceSearch: boolean;
}

