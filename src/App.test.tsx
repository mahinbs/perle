import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock navigator.share
Object.defineProperty(navigator, 'share', {
  value: vi.fn(() => Promise.resolve()),
  writable: true,
});

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  it('should render the app title', () => {
    render(<App />);
    expect(screen.getByText('SyntraIQ')).toBeInTheDocument();
  });

  it('should render mode selection buttons', () => {
    render(<App />);
    
    expect(screen.getByText('Ask')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('Summarize')).toBeInTheDocument();
    expect(screen.getByText('Compare')).toBeInTheDocument();
  });

  it('should render search bar', () => {
    render(<App />);
    
    const searchInput = screen.getByPlaceholderText("Ask anything — we'll cite every answer");
    expect(searchInput).toBeInTheDocument();
  });

  it('should have default query', () => {
    render(<App />);
    
    const searchInput = screen.getByDisplayValue('How will on‑device AI change search?');
    expect(searchInput).toBeInTheDocument();
  });

  it('should change mode when mode button is clicked', () => {
    render(<App />);
    
    const researchButton = screen.getByText('Research');
    fireEvent.click(researchButton);
    
    expect(researchButton).toHaveClass('active');
  });

  it('should perform search when search button is clicked', async () => {
    render(<App />);
    
    const searchButton = screen.getByText('Search');
    fireEvent.click(searchButton);
    
    // Wait for the search to complete
    await waitFor(() => {
      expect(screen.getByText('Answer')).toBeInTheDocument();
    });
  });

  it('should perform search when Enter is pressed', async () => {
    render(<App />);
    
    const searchInput = screen.getByPlaceholderText("Ask anything — we'll cite every answer");
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    
    await waitFor(() => {
      expect(screen.getByText('Answer')).toBeInTheDocument();
    });
  });

  it('should show discover section', () => {
    render(<App />);
    
    expect(screen.getByText('Discover')).toBeInTheDocument();
  });

  it('should show library section', () => {
    render(<App />);
    
    expect(screen.getByText('Library')).toBeInTheDocument();
  });

  it('should load search history from localStorage', () => {
    const mockHistory = ['query 1', 'query 2'];
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));
    
    render(<App />);
    
    expect(localStorageMock.getItem).toHaveBeenCalledWith('perle-search-history');
  });

  it('should save search to history', async () => {
    render(<App />);
    
    const searchInput = screen.getByPlaceholderText("Ask anything — we'll cite every answer");
    fireEvent.change(searchInput, { target: { value: 'new test query' } });
    
    const searchButton = screen.getByText('Search');
    fireEvent.click(searchButton);
    
    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'perle-search-history',
        expect.stringContaining('new test query')
      );
    });
  });

  it('should handle keyboard shortcuts', () => {
    render(<App />);
    
    // Test Cmd/Ctrl + K to focus input
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    
    const searchInput = screen.getByPlaceholderText("Ask anything — we'll cite every answer");
    expect(document.activeElement).toBe(searchInput);
  });

  it('should show loading state during search', async () => {
    render(<App />);
    
    const searchButton = screen.getByText('Search');
    fireEvent.click(searchButton);
    
    // Should show loading state
    expect(screen.getByText('…')).toBeInTheDocument();
  });

  it('should render navigation buttons', () => {
    render(<App />);
    
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });
});
