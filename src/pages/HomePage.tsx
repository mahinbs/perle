import { useCallback, useState, useEffect, useRef } from 'react';
import { Header } from '../components/Header';
import { ModeBar } from '../components/ModeBar';
import { SearchBar } from '../components/SearchBar';
import { AnswerCard } from '../components/AnswerCard';
import { DiscoverRail } from '../components/DiscoverRail';
import { UpgradeCard } from '../components/UpgradeCard';
import { fakeAnswerEngine } from '../utils/answerEngine';
import { formatQuery } from '../utils/helpers';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';
import type { Mode, AnswerResult, LLMModel } from '../types';

interface UploadedFile {
  id: string;
  file: File;
  type: 'image' | 'document' | 'other';
  preview?: string;
}

export default function HomePage() {
  const { state: currentData } = useRouterNavigation();
  const [mode, setMode] = useState<Mode>('Ask');
  const [query, setQuery] = useState<string>('How will on‑device AI change search?');
  const [searchedQuery, setSearchedQuery] = useState<string>(''); // Track the query that was actually searched
  const [answer, setAnswer] = useState<AnswerResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedModel, setSelectedModel] = useState<LLMModel>('gpt-4');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const answerCardRef = useRef<HTMLDivElement>(null);
  const lastSearchedQueryRef = useRef<string>('');
  const isSearchingRef = useRef<boolean>(false);

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

  // Handle search query from other pages
  useEffect(() => {
    if (currentData?.searchQuery) {
      setQuery(currentData.searchQuery);
      // Optionally auto-trigger search
      // doSearch();
    }
  }, [currentData]);

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

  const doSearch = useCallback((searchQuery?: string) => {
    const q = formatQuery(searchQuery || query);
    if (!q) {
      setAnswer(null);
      setSearchedQuery('');
      lastSearchedQueryRef.current = '';
      return;
    }

    // Prevent duplicate searches if already searching
    if (isSearchingRef.current) {
      return;
    }

    // Prevent duplicate searches if this is the same query as the last one
    const finalQuery = searchQuery || query;
    if (finalQuery === lastSearchedQueryRef.current) {
      return; // Don't search again if it's the same query
    }

    // Mark as searching and store the query
    isSearchingRef.current = true;
    lastSearchedQueryRef.current = finalQuery;

    setIsLoading(true);
    saveToHistory(q);
    
    // Update both query (for editing) and searchedQuery (for display)
    setQuery(finalQuery);
    setSearchedQuery(finalQuery);
    
    // Simulate API delay for better UX
    setTimeout(() => {
      const res = fakeAnswerEngine(q, mode, selectedModel, uploadedFiles);
      setAnswer(res);
      setIsLoading(false);
      isSearchingRef.current = false;
    }, 800);
  }, [query, mode, selectedModel, saveToHistory, uploadedFiles]);

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

  // Auto-scroll to AnswerCard when answer is received
  useEffect(() => {
    if (answer && !isLoading && answerCardRef.current) {
      // Small delay to ensure the answer is rendered
      setTimeout(() => {
        answerCardRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
      }, 100);
    }
  }, [answer, isLoading]);

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
        uploadedFiles={uploadedFiles}
        onFilesChange={setUploadedFiles}
        hasAnswer={!!answer && !isLoading}
        searchedQuery={searchedQuery}
      />

      <div className="spacer-12" />
      <div ref={answerCardRef}>
        <AnswerCard 
          chunks={answer?.chunks || []} 
          sources={answer?.sources || []}
          isLoading={isLoading}
          mode={answer?.mode || mode}
          query={searchedQuery}
          onQueryEdit={(editedQuery) => {
            setQuery(editedQuery);
            doSearch(editedQuery);
          }}
        />
      </div>

      <div className="spacer-16" />
      <DiscoverRail />

      <div className="spacer-24" />
      <UpgradeCard />

      <div className="spacer-40" />
    </div>
  );
}
