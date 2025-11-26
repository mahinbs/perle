import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../Header';

describe('Header', () => {
  it('should render the app title', () => {
    render(<Header />);
    expect(screen.getByText('SyntraIQ')).toBeInTheDocument();
  });

  it('should render navigation buttons', () => {
    render(<Header />);
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    render(<Header />);
    
    const discoverButton = screen.getByLabelText('Discover');
    const profileButton = screen.getByLabelText('Profile');
    
    expect(discoverButton).toBeInTheDocument();
    expect(profileButton).toBeInTheDocument();
  });
});
