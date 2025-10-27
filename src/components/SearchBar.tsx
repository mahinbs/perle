import React, { useState, useRef, useEffect } from 'react';
import { copyToClipboard } from '../utils/helpers';
import type { LLMModel } from '../types';

interface SearchBarProps {
  query: string;
  setQuery: (query: string) => void;
  onSearch: () => void;
  isLoading: boolean;
  showHistory: boolean;
  searchHistory: string[];
  onQuerySelect: (query: string) => void;
  selectedModel: LLMModel;
  onModelChange: (model: LLMModel) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  setQuery,
  onSearch,
  isLoading,
  showHistory,
  searchHistory,
  onQuerySelect,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        inputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSearch();
    }
  };

  const handleCopyQuery = async () => {
    await copyToClipboard(query);
    // Could show a toast notification here
  };

  const handleVoiceSearch = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQuery(transcript);
      };
      
      recognition.start();
    }
  };

  return (
    <div className="card" style={{ padding: 16, position: 'relative', overflow: 'visible' }}>
      <div className="row">
        <div 
          style={{ 
            width: 10, 
            height: 10, 
            borderRadius: 99, 
            background: 'var(--accent)',
            flexShrink: 0
          }} 
        />
        
        <input
          ref={inputRef}
          className="input"
          aria-label="Search"
          placeholder="Ask anything — we'll cite every answer"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            // Delay to allow clicks
          }}
          style={{ fontSize: 18 }}
        />
        
        <div className="row" style={{ gap: 8, flexShrink: 0 }}>
          {/* <LLMModelSelector
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            disabled={isLoading}
          /> */}
          
          {query && (
            <button
              className="btn-ghost"
              onClick={handleCopyQuery}
              aria-label="Copy query"
              style={{ padding: 8 }}
            >
              📋
            </button>
          )}
          
          <button
            className="btn-ghost"
            onClick={handleVoiceSearch}
            aria-label="Voice search"
            style={{ padding: 8 }}
          >
            🎤
          </button>
          
          <button
            className="btn"
            onClick={onSearch}
            disabled={isLoading || !query.trim()}
            style={{ minWidth: 80 }}
          >
            {isLoading ? '…' : 'Search'}
          </button>
        </div>
      </div>

      {/* Search History Dropdown */}
      {showHistory && searchHistory.length > 0 && (
        <div 
          className="card" 
          style={{ 
            // position: 'absolute',
            // top: '100%',
            // left: 0,
            // right: 0,
            marginTop: 8,
            padding: 8,
            zIndex: 1000,
            maxHeight: 200,
            overflowY: 'auto'
          }}
        >
          <div className="sub text-sm" style={{ marginBottom: 8, padding: '0 8px' }}>
            Recent searches
          </div>
          {searchHistory.slice(0, 5).map((item, index) => (
            <button
              key={index}
              className="btn-ghost"
              onClick={() => onQuerySelect(item)}
              style={{ 
                width: '100%', 
                justifyContent: 'flex-start',
                padding: '8px 12px',
                marginBottom: 4,
                textAlign: 'left'
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      {isFocused && query.length > 0 && (
        <div 
          className="row" 
          style={{ 
            marginTop: 12, 
            flexWrap: 'wrap', 
            gap: 8,
            opacity: 0.7
          }}
        >
          {[
            'Explain in simple terms',
            'Compare with alternatives',
            'What are the risks?',
            'Show recent examples'
          ].map(action => (
            <button
              key={action}
              className="chip"
              onClick={() => {
                setQuery(`${query} ${action.toLowerCase()}`);
              }}
              style={{ fontSize: 11 }}
            >
              {action}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
