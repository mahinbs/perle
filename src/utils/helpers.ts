/**
 * Utility functions for text processing and formatting
 */

export function formatQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ');
}

export function splitSentences(text: string): string[] {
  // Split on punctuation while keeping delimiters; avoids regex lookbehind
  const parts = text.split(/([.!?])/);
  const sentences: string[] = [];
  
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = (parts[i] || '').trim();
    const punct = (parts[i + 1] || '').trim();
    if (sentence) {
      sentences.push((sentence + (punct || '')).trim());
    }
  }
  
  return sentences;
}

export function rerankSources(sources: any[], query: string): any[] {
  const terms = new Set(formatQuery(query).toLowerCase().split(' '));
  
  return [...sources].sort((a, b) => {
    const aScore = a.title.toLowerCase().split(' ').some((t: string) => terms.has(t)) ? 1 : 0;
    const bScore = b.title.toLowerCase().split(' ').some((t: string) => terms.has(t)) ? 1 : 0;
    
    if (aScore !== bScore) return bScore - aScore; // matching title first
    return (b.year || 0) - (a.year || 0); // newer first
  });
}

export function chunkAnswer(text: string, sources: any[]): any[] {
  const sentences = splitSentences(text).filter(Boolean);
  const idPair = sources.slice(0, 2).map(s => s.id);
  const chunks: any[] = [];
  
  for (let i = 0; i < sentences.length; i += 2) {
    chunks.push({
      text: sentences.slice(i, i + 2).join(' '),
      citationIds: idPair,
      confidence: 0.85 + Math.random() * 0.1 // Mock confidence score
    });
  }
  
  return chunks.length ? chunks : [{ text, citationIds: idPair, confidence: 0.9 }];
}

export function extractDomain(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return domain.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

export function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substr(0, maxLength).trim() + '...';
}

export function highlightText(text: string, query: string): string {
  if (!query.trim()) return text;
  
  const terms = query.toLowerCase().split(' ').filter(Boolean);
  let highlighted = text;
  
  terms.forEach(term => {
    const regex = new RegExp(`(${term})`, 'gi');
    highlighted = highlighted.replace(regex, '<mark>$1</mark>');
  });
  
  return highlighted;
}

export function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return Promise.resolve();
  }
}

export function shareContent(data: { title?: string; text?: string; url?: string }): Promise<void> {
  if (navigator.share) {
    return navigator.share(data);
  } else {
    // Fallback to clipboard
    const shareText = [data.title, data.text, data.url].filter(Boolean).join('\n');
    return copyToClipboard(shareText);
  }
}
