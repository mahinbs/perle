import { describe, it, expect } from 'vitest';
import {
  formatQuery,
  splitSentences,
  rerankSources,
  chunkAnswer,
  extractDomain,
  formatTimestamp,
  debounce,
  throttle,
  generateId,
  truncateText,
  highlightText,
  isValidUrl,
  copyToClipboard,
  shareContent
} from '../helpers';

describe('formatQuery', () => {
  it('should normalize whitespace', () => {
    expect(formatQuery('  hello   world  ')).toBe('hello world');
  });

  it('should handle empty string', () => {
    expect(formatQuery('')).toBe('');
  });

  it('should handle single word', () => {
    expect(formatQuery('hello')).toBe('hello');
  });

  it('should handle multiple spaces', () => {
    expect(formatQuery('hello    world   test')).toBe('hello world test');
  });
});

describe('splitSentences', () => {
  it('should split on periods', () => {
    const result = splitSentences('A. B. C. D.');
    expect(result).toEqual(['A.', 'B.', 'C.', 'D.']);
  });

  it('should keep punctuation', () => {
    const result = splitSentences('Hello? Yes! Okay.');
    expect(result).toEqual(['Hello?', 'Yes!', 'Okay.']);
  });

  it('should handle no punctuation', () => {
    const result = splitSentences('No punctuation here');
    expect(result).toEqual(['No punctuation here']);
  });

  it('should handle mixed punctuation', () => {
    const result = splitSentences('First sentence. Second sentence! Third sentence?');
    expect(result).toEqual(['First sentence.', 'Second sentence!', 'Third sentence?']);
  });

  it('should handle empty string', () => {
    const result = splitSentences('');
    expect(result).toEqual([]);
  });
});

describe('rerankSources', () => {
  const testSources = [
    { id: '1', title: 'foo bar', url: '#', year: 2020 },
    { id: '2', title: 'hello world', url: '#', year: 2024 },
    { id: '3', title: 'other', url: '#', year: 2023 },
    { id: '4', title: 'hello again', url: '#', year: 2022 },
  ];

  it('should surface newest matching first', () => {
    const ranked = rerankSources(testSources, 'hello');
    expect(ranked[0].id).toBe('2');
    expect(ranked[1].id).toBe('4');
  });

  it('should handle no matches', () => {
    const ranked = rerankSources(testSources, 'xyz');
    expect(ranked[0].id).toBe('2'); // newest first
    expect(ranked[1].id).toBe('3');
  });

  it('should handle empty query', () => {
    const ranked = rerankSources(testSources, '');
    expect(ranked[0].id).toBe('2'); // newest first
  });
});

describe('chunkAnswer', () => {
  const testSources = [
    { id: 'a', title: 'source1', url: '#' },
    { id: 'b', title: 'source2', url: '#' }
  ];

  it('should group sentences by ~2', () => {
    const chunks = chunkAnswer('A. B. C. D.', testSources);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe('A. B.');
    expect(chunks[1].text).toBe('C. D.');
  });

  it('should attach citations', () => {
    const chunks = chunkAnswer('A. B. C. D.', testSources);
    expect(chunks[0].citationIds).toEqual(['a', 'b']);
  });

  it('should handle single sentence', () => {
    const chunks = chunkAnswer('Single sentence only', testSources);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Single sentence only');
  });

  it('should handle empty text', () => {
    const chunks = chunkAnswer('', testSources);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('');
  });
});

describe('extractDomain', () => {
  it('should extract domain from URL', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('example.com');
  });

  it('should handle URL without www', () => {
    expect(extractDomain('https://example.com/path')).toBe('example.com');
  });

  it('should handle invalid URL', () => {
    expect(extractDomain('not-a-url')).toBe('unknown');
  });
});

describe('formatTimestamp', () => {
  it('should format recent timestamps', () => {
    const now = Date.now();
    expect(formatTimestamp(now - 30000)).toBe('Just now');
    expect(formatTimestamp(now - 300000)).toBe('5m ago');
    expect(formatTimestamp(now - 3600000)).toBe('1h ago');
    expect(formatTimestamp(now - 86400000)).toBe('1d ago');
  });
});

describe('debounce', () => {
  it('should delay function execution', async () => {
    let callCount = 0;
    const debouncedFn = debounce(() => {
      callCount++;
    }, 100);

    debouncedFn();
    debouncedFn();
    debouncedFn();

    await new Promise(resolve => setTimeout(resolve, 150));
    expect(callCount).toBe(1);
  });
});

describe('throttle', () => {
  it('should limit function execution rate', async () => {
    let callCount = 0;
    const throttledFn = throttle(() => {
      callCount++;
    }, 100);

    throttledFn();
    throttledFn();
    throttledFn();

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(callCount).toBe(1);
  });
});

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1).toHaveLength(9);
  });
});

describe('truncateText', () => {
  it('should truncate long text', () => {
    const text = 'This is a very long text that should be truncated';
    const result = truncateText(text, 20);
    expect(result).toBe('This is a very long...');
  });

  it('should not truncate short text', () => {
    const text = 'Short text';
    const result = truncateText(text, 20);
    expect(result).toBe('Short text');
  });
});

describe('highlightText', () => {
  it('should highlight matching terms', () => {
    const text = 'Hello world test';
    const result = highlightText(text, 'world');
    expect(result).toBe('Hello <mark>world</mark> test');
  });

  it('should handle multiple terms', () => {
    const text = 'Hello world test';
    const result = highlightText(text, 'hello test');
    expect(result).toBe('<mark>Hello</mark> world <mark>test</mark>');
  });

  it('should handle empty query', () => {
    const text = 'Hello world';
    const result = highlightText(text, '');
    expect(result).toBe('Hello world');
  });
});

describe('isValidUrl', () => {
  it('should validate correct URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('https://www.example.com/path')).toBe(true);
  });

  it('should reject invalid URLs', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
  });
});

describe('copyToClipboard', () => {
  it('should be a function', () => {
    expect(typeof copyToClipboard).toBe('function');
  });
});

describe('shareContent', () => {
  it('should be a function', () => {
    expect(typeof shareContent).toBe('function');
  });
});
