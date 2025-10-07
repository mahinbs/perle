import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from '../SearchBar';
import type { LLMModel } from '../../types';

describe('SearchBar', () => {
  const defaultProps = {
    query: '',
    setQuery: vi.fn(),
    onSearch: vi.fn(),
    isLoading: false,
    showHistory: false,
    searchHistory: [],
    onQuerySelect: vi.fn(),
    selectedModel: 'gpt-4' as LLMModel,
    onModelChange: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render search input', () => {
    render(<SearchBar {...defaultProps} />);
    
    const input = screen.getByPlaceholderText("Ask anything — we'll cite every answer");
    expect(input).toBeInTheDocument();
  });

  it('should display query value', () => {
    render(<SearchBar {...defaultProps} query="test query" />);
    
    const input = screen.getByDisplayValue('test query');
    expect(input).toBeInTheDocument();
  });

  it('should call setQuery when input changes', () => {
    const mockSetQuery = vi.fn();
    render(<SearchBar {...defaultProps} setQuery={mockSetQuery} />);
    
    const input = screen.getByPlaceholderText("Ask anything — we'll cite every answer");
    fireEvent.change(input, { target: { value: 'new query' } });
    
    expect(mockSetQuery).toHaveBeenCalledWith('new query');
  });

  it('should call onSearch when Enter is pressed', () => {
    const mockOnSearch = vi.fn();
    render(<SearchBar {...defaultProps} onSearch={mockOnSearch} query="test" />);
    
    const input = screen.getByPlaceholderText("Ask anything — we'll cite every answer");
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(mockOnSearch).toHaveBeenCalled();
  });

  it('should call onSearch when search button is clicked', () => {
    const mockOnSearch = vi.fn();
    render(<SearchBar {...defaultProps} onSearch={mockOnSearch} query="test" />);
    
    const searchButton = screen.getByText('Search');
    fireEvent.click(searchButton);
    
    expect(mockOnSearch).toHaveBeenCalled();
  });

  it('should show loading state', () => {
    render(<SearchBar {...defaultProps} isLoading={true} />);
    
    const searchButton = screen.getByText('…');
    expect(searchButton).toBeInTheDocument();
  });

  it('should disable search button when query is empty', () => {
    render(<SearchBar {...defaultProps} query="" />);
    
    const searchButton = screen.getByText('Search');
    expect(searchButton).toBeDisabled();
  });

  it('should show search history when available', () => {
    const searchHistory = ['query 1', 'query 2', 'query 3'];
    render(<SearchBar {...defaultProps} showHistory={true} searchHistory={searchHistory} />);
    
    expect(screen.getByText('Recent searches')).toBeInTheDocument();
    expect(screen.getByText('query 1')).toBeInTheDocument();
    expect(screen.getByText('query 2')).toBeInTheDocument();
    expect(screen.getByText('query 3')).toBeInTheDocument();
  });

  it('should call onQuerySelect when history item is clicked', () => {
    const mockOnQuerySelect = vi.fn();
    const searchHistory = ['query 1', 'query 2'];
    render(<SearchBar {...defaultProps} showHistory={true} searchHistory={searchHistory} onQuerySelect={mockOnQuerySelect} />);
    
    const historyItem = screen.getByText('query 1');
    fireEvent.click(historyItem);
    
    expect(mockOnQuerySelect).toHaveBeenCalledWith('query 1');
  });

  it('should show copy button when query exists', () => {
    render(<SearchBar {...defaultProps} query="test query" />);
    
    const copyButton = screen.getByLabelText('Copy query');
    expect(copyButton).toBeInTheDocument();
  });

  it('should show voice search button', () => {
    render(<SearchBar {...defaultProps} />);
    
    const voiceButton = screen.getByLabelText('Voice search');
    expect(voiceButton).toBeInTheDocument();
  });

  it('should show quick actions when focused with query', () => {
    render(<SearchBar {...defaultProps} query="test" />);
    
    const input = screen.getByPlaceholderText("Ask anything — we'll cite every answer");
    fireEvent.focus(input);
    
    expect(screen.getByText('Explain in simple terms')).toBeInTheDocument();
    expect(screen.getByText('Compare with alternatives')).toBeInTheDocument();
  });
});
