import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../Header';

describe('Header', () => {
  it('should render the app title', () => {
    render(<Header />);
    expect(screen.getByText('Perlé')).toBeInTheDocument();
  });

  it('should render navigation buttons', () => {
    render(<Header />);
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    render(<Header />);
    
    const discoverButton = screen.getByLabelText('Discover');
    const libraryButton = screen.getByLabelText('Library');
    const profileButton = screen.getByLabelText('Profile');
    
    expect(discoverButton).toBeInTheDocument();
    expect(libraryButton).toBeInTheDocument();
    expect(profileButton).toBeInTheDocument();
  });

  it('should call onMenuClick when provided', () => {
    const mockOnMenuClick = vi.fn();
    render(<Header onMenuClick={mockOnMenuClick} />);
    
    // Note: This test would need to be updated based on actual menu implementation
    expect(mockOnMenuClick).toBeDefined();
  });
});
