export type Mode = 'Ask' | 'Research' | 'Summarize' | 'Compare';

export type LLMModel = 'gpt-4' | 'gpt-3.5-turbo' | 'claude-3-opus' | 'claude-3-sonnet' | 'claude-3-haiku' | 'gemini-pro' | 'gemini-pro-vision' | 'llama-2' | 'mistral-7b';

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

export interface AnswerResult {
  sources: Source[];
  chunks: AnswerChunk[];
  query: string;
  mode: Mode;
  timestamp: number;
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
}

export interface LibraryItem {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  tags: string[];
  isBookmarked?: boolean;
}
