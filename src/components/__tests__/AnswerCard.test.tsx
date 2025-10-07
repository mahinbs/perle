import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnswerCard } from '../AnswerCard';
import type { AnswerChunk, Source } from '../../types';

describe('AnswerCard', () => {
  const mockSources: Source[] = [
    {
      id: 's1',
      title: 'Test Source 1',
      url: 'https://example.com',
      year: 2024,
      domain: 'example.com',
      snippet: 'Test snippet 1'
    },
    {
      id: 's2',
      title: 'Test Source 2',
      url: 'https://test.com',
      year: 2023,
      domain: 'test.com',
      snippet: 'Test snippet 2'
    }
  ];

  const mockChunks: AnswerChunk[] = [
    {
      text: 'This is the first chunk of the answer.',
      citationIds: ['s1'],
      confidence: 0.9
    },
    {
      text: 'This is the second chunk of the answer.',
      citationIds: ['s2'],
      confidence: 0.85
    }
  ];

  const defaultProps = {
    chunks: mockChunks,
    sources: mockSources,
    isLoading: false
  };

  beforeEach(() => {
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => null),
        removeItem: vi.fn(() => null),
      },
      writable: true,
    });

    // Mock navigator.share
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(() => Promise.resolve()),
      writable: true,
    });
  });

  it('should render answer chunks', () => {
    render(<AnswerCard {...defaultProps} />);
    
    expect(screen.getByText('This is the first chunk of the answer.')).toBeInTheDocument();
    expect(screen.getByText('This is the second chunk of the answer.')).toBeInTheDocument();
  });

  it('should render source chips', () => {
    render(<AnswerCard {...defaultProps} />);
    
    expect(screen.getByText('Test Source 1')).toBeInTheDocument();
    expect(screen.getByText('Test Source 2')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(<AnswerCard {...defaultProps} isLoading={true} />);
    
    expect(screen.getByText('Answer')).toBeInTheDocument();
    // Skeleton elements should be present
    const skeletons = document.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should show empty state when no chunks', () => {
    render(<AnswerCard {...defaultProps} chunks={[]} />);
    
    expect(screen.getByText('Ask a question to get a sourced, concise answer.')).toBeInTheDocument();
  });

  it('should show follow-up actions', () => {
    render(<AnswerCard {...defaultProps} />);
    
    expect(screen.getByText('Show recent studies only')).toBeInTheDocument();
    expect(screen.getByText('Compare viewpoints')).toBeInTheDocument();
    expect(screen.getByText('Summarize in 5 bullets')).toBeInTheDocument();
    expect(screen.getByText('What are the risks?')).toBeInTheDocument();
  });

  it('should show sources section', () => {
    render(<AnswerCard {...defaultProps} />);
    
    const sourcesButton = screen.getByText('Sources (2)');
    expect(sourcesButton).toBeInTheDocument();
  });

  it('should expand sources when clicked', () => {
    render(<AnswerCard {...defaultProps} />);
    
    const sourcesButton = screen.getByText('Sources (2)');
    fireEvent.click(sourcesButton);
    
    expect(screen.getByText('Test Source 1')).toBeInTheDocument();
    expect(screen.getByText('Test Source 2')).toBeInTheDocument();
  });

  it('should show bookmark and share buttons', () => {
    render(<AnswerCard {...defaultProps} />);
    
    const bookmarkButton = screen.getByLabelText('Bookmark answer');
    const shareButton = screen.getByLabelText('Share answer');
    
    expect(bookmarkButton).toBeInTheDocument();
    expect(shareButton).toBeInTheDocument();
  });

  it('should show copy buttons for chunks', () => {
    render(<AnswerCard {...defaultProps} />);
    
    const copyButtons = screen.getAllByLabelText('Copy chunk');
    expect(copyButtons).toHaveLength(2);
  });

  it('should handle bookmark click', () => {
    render(<AnswerCard {...defaultProps} />);
    
    const bookmarkButton = screen.getByLabelText('Bookmark answer');
    fireEvent.click(bookmarkButton);
    
    expect(window.localStorage.setItem).toHaveBeenCalled();
  });

  it('should handle share click', async () => {
    render(<AnswerCard {...defaultProps} />);
    
    const shareButton = screen.getByLabelText('Share answer');
    fireEvent.click(shareButton);
    
    expect(navigator.share).toHaveBeenCalled();
  });

  it('should show suggestions in empty state', () => {
    render(<AnswerCard {...defaultProps} chunks={[]} />);
    
    expect(screen.getByText('What is machine learning?')).toBeInTheDocument();
    expect(screen.getByText('How does AI work?')).toBeInTheDocument();
    expect(screen.getByText('Compare React vs Vue')).toBeInTheDocument();
    expect(screen.getByText('Explain quantum computing')).toBeInTheDocument();
  });
});
