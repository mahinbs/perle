import { useCallback, useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ModeBar } from './components/ModeBar';
import { SearchBar } from './components/SearchBar';
import { AnswerCard } from './components/AnswerCard';
import { DiscoverRail } from './components/DiscoverRail';
import { fakeAnswerEngine } from './utils/answerEngine';
import { formatQuery } from './utils/helpers';
import type { Mode, AnswerResult, LLMModel } from './types';

export default function App() {
  const [mode, setMode] = useState<Mode>('Ask');
  const [query, setQuery] = useState<string>('How will on‑device AI change search?');
  const [answer, setAnswer] = useState<AnswerResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedModel, setSelectedModel] = useState<LLMModel>('gpt-4');

  // Load search history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('perle-search-history');
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to parse search history:', e);
      }
    }
  }, []);

  // Save search history to localStorage
  const saveToHistory = useCallback((newQuery: string) => {
    const formatted = formatQuery(newQuery);
    if (!formatted) return;
    
    setSearchHistory(prev => {
      const updated = [formatted, ...prev.filter(q => q !== formatted)].slice(0, 10);
      localStorage.setItem('perle-search-history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const doSearch = useCallback(() => {
    const q = formatQuery(query);
    if (!q) {
      setAnswer(null);
      return;
    }

    setIsLoading(true);
    saveToHistory(q);
    
    // Simulate API delay for better UX
    setTimeout(() => {
      const res = fakeAnswerEngine(q, mode, selectedModel);
      setAnswer(res);
      setIsLoading(false);
    }, 800);
  }, [query, mode, selectedModel, saveToHistory]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 'k':
            e.preventDefault();
            document.querySelector('input')?.focus();
            break;
          case 'Enter':
            e.preventDefault();
            doSearch();
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [doSearch]);

  // Handle pull-to-refresh on mobile
  useEffect(() => {
    let startY = 0;
    let isPulling = false;

    const handleTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      isPulling = window.scrollY === 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling) return;
      
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      
      if (diff > 100) {
        // Trigger refresh
        doSearch();
        isPulling = false;
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, [doSearch]);

  const handleQuerySelect = useCallback((selectedQuery: string) => {
    setQuery(selectedQuery);
    setShowHistory(false);
  }, []);

  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
    setShowHistory(newQuery.length > 0);
  }, []);

  return (
    <div className="container">
      <Header />
      
      <div className="sub text-sm" style={{ marginTop: 6 }}>
        An elegant answer engine with citations, comparisons, and summaries.
      </div>

      <div className="spacer-8" />
      <ModeBar mode={mode} setMode={setMode} />

      <div className="spacer-12" />
      <SearchBar 
        query={query} 
        setQuery={handleQueryChange}
        onSearch={doSearch}
        isLoading={isLoading}
        showHistory={showHistory}
        searchHistory={searchHistory}
        onQuerySelect={handleQuerySelect}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />

      <div className="spacer-12" />
      <AnswerCard 
        chunks={answer?.chunks || []} 
        sources={answer?.sources || []}
        isLoading={isLoading}
      />

      <div className="spacer-16" />
      <DiscoverRail />

      <div className="spacer-40" />
    </div>
  );
}
