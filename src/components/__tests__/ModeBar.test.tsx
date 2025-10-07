import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeBar } from '../ModeBar';
import type { Mode } from '../../types';

describe('ModeBar', () => {
  it('should render all mode buttons', () => {
    const mockSetMode = vi.fn();
    render(<ModeBar mode="Ask" setMode={mockSetMode} />);
    
    expect(screen.getByText('Ask')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('Summarize')).toBeInTheDocument();
    expect(screen.getByText('Compare')).toBeInTheDocument();
  });

  it('should highlight active mode', () => {
    const mockSetMode = vi.fn();
    render(<ModeBar mode="Research" setMode={mockSetMode} />);
    
    const researchButton = screen.getByText('Research');
    expect(researchButton).toHaveClass('active');
  });

  it('should call setMode when button is clicked', () => {
    const mockSetMode = vi.fn();
    render(<ModeBar mode="Ask" setMode={mockSetMode} />);
    
    const researchButton = screen.getByText('Research');
    fireEvent.click(researchButton);
    
    expect(mockSetMode).toHaveBeenCalledWith('Research');
  });

  it('should have proper accessibility attributes', () => {
    const mockSetMode = vi.fn();
    render(<ModeBar mode="Ask" setMode={mockSetMode} />);
    
    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('aria-label', 'Search modes');
    
    const askButton = screen.getByText('Ask');
    expect(askButton).toHaveAttribute('aria-pressed', 'true');
    expect(askButton).toHaveAttribute('aria-label', 'Mode Ask');
  });

  it('should handle all mode changes', () => {
    const mockSetMode = vi.fn();
    render(<ModeBar mode="Ask" setMode={mockSetMode} />);
    
    const modes: Mode[] = ['Ask', 'Research', 'Summarize', 'Compare'];
    
    modes.forEach(mode => {
      const button = screen.getByText(mode);
      fireEvent.click(button);
      expect(mockSetMode).toHaveBeenCalledWith(mode);
    });
  });
});
