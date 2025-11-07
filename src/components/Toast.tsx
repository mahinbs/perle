import React, { useEffect, useState } from 'react';

export interface ToastOptions {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
}

interface ToastProps extends ToastOptions {
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'success', 
  duration = 3000,
  onClose 
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation
    setIsVisible(true);
    
    // Auto close after duration
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getToastStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      background: 'var(--background, #1a1a1a)',
      border: '1px solid var(--border, #333333)',
      borderRadius: 8,
      padding: '12px 16px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      minWidth: 250,
      maxWidth: 400,
      fontSize: 'var(--font-sm)',
      color: 'var(--text, #ffffff)',
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'translateY(0)' : 'translateY(-10px)',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      zIndex: 10000,
      position: 'relative'
    };

    if (type === 'success') {
      return {
        ...baseStyles,
        borderLeft: '3px solid #4CAF50',
        background: 'var(--background, #1a1a1a)'
      };
    } else if (type === 'error') {
      return {
        ...baseStyles,
        borderLeft: '3px solid #F44336',
        background: 'var(--background, #1a1a1a)'
      };
    } else {
      return {
        ...baseStyles,
        borderLeft: '3px solid var(--accent, #007AFF)',
        background: 'var(--background, #1a1a1a)'
      };
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      default:
        return 'ℹ';
    }
  };

  return (
    <div style={getToastStyles()}>
      <div style={{ 
        fontSize: 'var(--font-lg)',
        flexShrink: 0,
        color: type === 'success' ? '#4CAF50' : type === 'error' ? '#F44336' : 'var(--accent, #007AFF)'
      }}>
        {getIcon()}
      </div>
      <div style={{ flex: 1 }}>
        {message}
      </div>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          fontSize: 'var(--font-lg)',
          color: 'var(--sub, #999)',
          opacity: 0.7,
          flexShrink: 0
        }}
        aria-label="Close toast"
      >
        ×
      </button>
    </div>
  );
};

