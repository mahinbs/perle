import { describe, it, expect } from 'vitest';
import { fakeAnswerEngine, searchAPI, getSearchSuggestions, getRelatedQueries } from '../answerEngine';
import type { Mode } from '../../types';

describe('fakeAnswerEngine', () => {
  it('should return answer result with sources and chunks', () => {
    const result = fakeAnswerEngine('test query', 'Ask');
    
    expect(result).toHaveProperty('sources');
    expect(result).toHaveProperty('chunks');
    expect(result).toHaveProperty('query');
    expect(result).toHaveProperty('mode');
    expect(result).toHaveProperty('timestamp');
    
    expect(result.query).toBe('test query');
    expect(result.mode).toBe('Ask');
    expect(Array.isArray(result.sources)).toBe(true);
    expect(Array.isArray(result.chunks)).toBe(true);
  });

  it('should return different content for different modes', () => {
    const askResult = fakeAnswerEngine('AI technology', 'Ask');
    const researchResult = fakeAnswerEngine('AI technology', 'Research');
    
    expect(askResult.chunks[0].text).not.toBe(researchResult.chunks[0].text);
  });

  it('should include sources with proper structure', () => {
    const result = fakeAnswerEngine('test', 'Ask');
    const source = result.sources[0];
    
    expect(source).toHaveProperty('id');
    expect(source).toHaveProperty('title');
    expect(source).toHaveProperty('url');
    expect(source).toHaveProperty('year');
    expect(source).toHaveProperty('domain');
    expect(source).toHaveProperty('snippet');
  });

  it('should include chunks with proper structure', () => {
    const result = fakeAnswerEngine('test', 'Ask');
    const chunk = result.chunks[0];
    
    expect(chunk).toHaveProperty('text');
    expect(chunk).toHaveProperty('citationIds');
    expect(chunk).toHaveProperty('confidence');
    expect(Array.isArray(chunk.citationIds)).toBe(true);
    expect(typeof chunk.confidence).toBe('number');
  });

  it('should handle all modes', () => {
    const modes: Mode[] = ['Ask', 'Research', 'Summarize', 'Compare'];
    
    modes.forEach(mode => {
      const result = fakeAnswerEngine('test query', mode);
      expect(result.mode).toBe(mode);
      expect(result.chunks.length).toBeGreaterThan(0);
    });
  });
});

describe('searchAPI', () => {
  it('should return a promise', () => {
    const promise = searchAPI('test', 'Ask');
    expect(promise).toBeInstanceOf(Promise);
  });

  it('should resolve with answer result', async () => {
    const result = await searchAPI('test query', 'Ask');
    
    expect(result).toHaveProperty('sources');
    expect(result).toHaveProperty('chunks');
    expect(result).toHaveProperty('query');
    expect(result).toHaveProperty('mode');
    expect(result).toHaveProperty('timestamp');
  });
});

describe('getSearchSuggestions', () => {
  it('should return suggestions array', async () => {
    const suggestions = await getSearchSuggestions('AI');
    
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('should include query in suggestions', async () => {
    const suggestions = await getSearchSuggestions('machine learning');
    
    suggestions.forEach(suggestion => {
      expect(suggestion.toLowerCase()).toContain('machine learning');
    });
  });
});

describe('getRelatedQueries', () => {
  it('should return related queries array', async () => {
    const related = await getRelatedQueries('AI');
    
    expect(Array.isArray(related)).toBe(true);
    expect(related.length).toBeGreaterThan(0);
    expect(related.length).toBeLessThanOrEqual(4);
  });

  it('should include query in related queries', async () => {
    const related = await getRelatedQueries('blockchain');
    
    related.forEach(query => {
      expect(query.toLowerCase()).toContain('blockchain');
    });
  });
});
